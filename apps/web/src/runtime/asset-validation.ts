/**
 * What may be brought onto a board, and how that is decided.
 *
 * This is policy, not storage, which is why it sits beside the runtime rather
 * than in an adapter: swapping IndexedDB for a server must not change what a
 * user is allowed to upload.
 */

/**
 * SVG IS DELIBERATELY ABSENT.
 *
 * An SVG is not an image but a document: it can carry `<script>`, external
 * references, CSS and foreign objects, so rendering an untrusted one is running
 * untrusted markup. Accepting it safely means sanitising it, and a
 * half-sanitised SVG is more dangerous than a rejected one because it looks
 * handled. It can be added when there is a sanitiser to add with it — see
 * docs/architecture/11-security.md.
 */
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number]

/** Large enough for a photograph, small enough not to wedge IndexedDB. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024

export type ValidationFailure =
  | { readonly reason: 'too-large'; readonly byteSize: number }
  | { readonly reason: 'unsupported-type'; readonly declared: string }
  | {
      readonly reason: 'content-mismatch'
      readonly declared: string
      readonly actual: string | null
    }

export type ValidationResult =
  | { readonly ok: true; readonly type: AllowedImageType }
  | { readonly ok: false; readonly failure: ValidationFailure }

/** Byte signatures, long enough that a false positive is not a realistic worry. */
const SIGNATURES: readonly { readonly type: AllowedImageType; readonly bytes: readonly number[] }[] =
  [
    { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
    { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
    { type: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  ]

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((byte, index) => bytes[index] === byte)
}

/**
 * Identifies an image from its leading bytes.
 *
 * A `File`'s declared MIME type is derived from its extension, so it is
 * trivially wrong: renaming `payload.svg` to `photo.png` produces a File that
 * claims to be a PNG. The bytes are what actually decides.
 */
export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  for (const { type, bytes: signature } of SIGNATURES) {
    if (startsWith(bytes, signature)) return type
  }
  // WebP is a RIFF container: "RIFF" then four size bytes then "WEBP", so both
  // halves have to match — "RIFF" alone is also WAV and AVI.
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])) {
    return 'image/webp'
  }
  return null
}

function isAllowed(type: string): type is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type)
}

/**
 * Validates an upload by size, declared type AND actual content.
 *
 * All three matter. Size is checked first because it is free and rejects the
 * pathological case before anything reads the bytes. The declared type gives a
 * clear message for the ordinary mistake of dragging in a PDF. Sniffing is the
 * one a file cannot lie about, and is what keeps a disguised SVG out.
 */
export function validateImage(
  declaredType: string,
  bytes: Uint8Array,
  byteSize: number,
): ValidationResult {
  if (byteSize > MAX_IMAGE_BYTES) return { ok: false, failure: { reason: 'too-large', byteSize } }
  if (!isAllowed(declaredType)) {
    return { ok: false, failure: { reason: 'unsupported-type', declared: declaredType } }
  }
  const actual = sniffImageType(bytes)
  if (actual !== declaredType) {
    return { ok: false, failure: { reason: 'content-mismatch', declared: declaredType, actual } }
  }
  return { ok: true, type: declaredType }
}

/** Phrased for someone who dragged a file in, not for a log. */
export function describeFailure(failure: ValidationFailure): string {
  switch (failure.reason) {
    case 'too-large': {
      const mb = (failure.byteSize / 1024 / 1024).toFixed(1)
      return `That image is ${mb}MB — the limit is ${String(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`
    }
    case 'unsupported-type':
      return failure.declared === 'image/svg+xml'
        ? 'SVG files are not supported yet. Use PNG, JPEG, GIF or WebP.'
        : `${failure.declared || 'That file'} is not a supported image. Use PNG, JPEG, GIF or WebP.`
    case 'content-mismatch':
      return `That file is named like ${failure.declared} but its contents are ${failure.actual ?? 'not a supported image'}.`
  }
}
