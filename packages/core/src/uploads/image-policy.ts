/**
 * What may be brought onto a board as an image, decided by its content.
 *
 * ONE policy, read by both the browser that uploads and the room that stores.
 * It used to be written twice and the two had drifted: the browser allowed
 * 20MB and refused AVIF, the room allowed 12MB and took AVIF, and only the
 * browser looked at the bytes. A server check that is weaker than the client's
 * is the only one an attacker meets, and a client check that is looser than
 * the server's is a promise the upload then breaks. Here, so neither can.
 *
 * Pure data and pure functions: no DOM, no Workers runtime, nothing to import.
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
export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
] as const
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number]

/**
 * Large enough for a photograph, small enough that a board is not free file
 * hosting and a room never has to hold much in memory to check what it got.
 */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024

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
const SIGNATURES: readonly {
  readonly type: AllowedImageType
  readonly bytes: readonly number[]
}[] = [
  { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
]

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((byte, index) => bytes[index] === byte)
}

const ascii = (text: string): number[] => [...text].map((char) => char.charCodeAt(0))

/**
 * Identifies an image from its leading bytes.
 *
 * A declared MIME type is whatever the sender says — for a browser `File` it
 * is derived from the extension, so renaming `payload.svg` to `photo.png`
 * produces a file that claims to be a PNG. The bytes are what actually decide.
 */
export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  for (const { type, bytes: signature } of SIGNATURES) {
    if (startsWith(bytes, signature)) return type
  }
  // WebP is a RIFF container: "RIFF" then four size bytes then "WEBP", so both
  // halves have to match — "RIFF" alone is also WAV and AVI.
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes.subarray(8), ascii('WEBP'))) {
    return 'image/webp'
  }
  if (isAvif(bytes)) return 'image/avif'
  return null
}

const AVIF_BRANDS = [ascii('avif'), ascii('avis')]

/**
 * Whether this is an AVIF: an ISO-BMFF file whose leading file-type box names
 * an AVIF brand.
 *
 * The brand is what separates it from MP4 and HEIC, which share the box — and
 * it may be the MAJOR brand or any of the COMPATIBLE ones. The spec only asks
 * for it somewhere in the box, and real encoders lead with the generic `mif1`
 * or `msf1` and list `avif` after it. Brands are read no further than the box
 * says it runs, nor past the end of what was given.
 */
function isAvif(bytes: Uint8Array): boolean {
  if (!startsWith(bytes.subarray(4), ascii('ftyp'))) return false
  const declared = (bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!
  const end = Math.min(declared >>> 0, bytes.length)
  // The major brand at 8, then a minor version at 12 that is NOT a brand, then
  // the compatible brands from 16, four bytes each.
  const offsets = [8]
  for (let at = 16; at + 4 <= end; at += 4) offsets.push(at)
  return offsets.some(
    (at) =>
      at + 4 <= end && AVIF_BRANDS.some((brand) => startsWith(bytes.subarray(at, at + 4), brand)),
  )
}

export function isAllowedImageType(type: string): type is AllowedImageType {
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
  if (!isAllowedImageType(declaredType)) {
    return { ok: false, failure: { reason: 'unsupported-type', declared: declaredType } }
  }
  const actual = sniffImageType(bytes)
  if (actual !== declaredType) {
    return { ok: false, failure: { reason: 'content-mismatch', declared: declaredType, actual } }
  }
  return { ok: true, type: declaredType }
}
