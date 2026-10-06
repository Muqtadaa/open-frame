import type { RoomRole } from '@openframe/collab'
import { isAllowedImageType, MAX_IMAGE_BYTES, validateImage } from '@openframe/core/uploads'

import { readDecision } from './access.js'

/**
 * Who may read and write a board's images, decided without touching storage,
 * R2 or a runtime.
 *
 * Here rather than in `room-object.ts` for the reason `access.ts` gives: a
 * Durable Object can only be exercised by deploying it, and **a guard that can
 * only be run by deploying is a guard nobody runs.** This decides who can see
 * every picture anybody has ever put on a board, so it is the last place that
 * should be true of.
 *
 * Everything here is values in, decision out.
 */

/**
 * What an image may be, checked AGAIN on the server — by the SAME policy the
 * browser applies (`@openframe/core/uploads`), not a copy of it.
 *
 * The web app checks size, declared type and sniffed bytes before an upload
 * starts (rule 19), and none of that binds anybody who skips the web app. A
 * client-side check is a courtesy to the user; this is the one that decides
 * what ends up in the bucket. It used to be a second list, and the two had
 * drifted — 20MB against 12MB, AVIF on one side only, bytes sniffed on one
 * side only. Reading one policy is what stops that happening again.
 */
export const MAX_ASSET_BYTES = MAX_IMAGE_BYTES

export interface AssetRequest {
  readonly method: string
  /** What the caller's key entitles them to, or `null` for no valid key. */
  readonly role: RoomRole | null
  /** Whether the caller presented the owner key, which skips the password. */
  readonly owner: boolean
  /** Whether this board's password has been satisfied for this caller. */
  readonly unlocked: boolean
  /** Only meaningful on a write. */
  readonly contentType?: string | null
  readonly contentLength?: number | null
}

export type AssetDecision =
  | { readonly ok: true; readonly write: false }
  | { readonly ok: true; readonly write: true; readonly contentType: string }
  | { readonly ok: false; readonly status: number; readonly reason: string }

/**
 * Whether this request may proceed.
 *
 * READING needs any valid key, because anyone who can open the board can
 * already see the picture on it — refusing the bytes to a viewer would show
 * them a board full of broken images and teach them nothing. WRITING needs the
 * edit key, for the same reason editing does.
 *
 * The password is a SECOND factor over both, exactly as it is over the socket,
 * and the owner is never asked for it: they set it, and a board that locks out
 * the person whose board it is is a board they have lost.
 */
export function assetDecision(request: AssetRequest): AssetDecision {
  const writing = request.method === 'PUT'
  if (!writing && request.method !== 'GET') {
    return { ok: false, status: 405, reason: 'An asset is a GET or a PUT' }
  }

  const read = readDecision(request)
  if (!read.ok) return read

  if (!writing) return { ok: true, write: false }

  if (request.role !== 'editor') {
    return { ok: false, status: 403, reason: 'That link cannot add to this board' }
  }

  const declared = (request.contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  if (!isAllowedImageType(declared)) {
    return { ok: false, status: 415, reason: 'That is not an image this board accepts' }
  }

  /*
   * A missing length is refused rather than waved through. A streamed upload
   * with no declared size cannot be checked against the ceiling before it is
   * spent, and "we will find out when it is too late" is not a limit.
   */
  const length = request.contentLength
  if (length === null || length === undefined || !Number.isFinite(length) || length <= 0) {
    return { ok: false, status: 411, reason: 'An upload must say how big it is' }
  }
  if (length > MAX_ASSET_BYTES) {
    return { ok: false, status: 413, reason: 'That image is too large' }
  }

  return { ok: true, write: true, contentType: declared }
}

/** Where a board's asset lives in the bucket. Prefixed so a board's images can
 * be deleted together when the board is. */
export function assetKey(boardId: string, assetId: string): string {
  return `${boardId}/${assetId}`
}

/**
 * The two things a board's cleanup needs from R2, and nothing else.
 *
 * A structural subset of `R2Bucket`, so the real binding is passed straight
 * in and the loop below runs in Node against a bucket in memory.
 */
export interface AssetBucket {
  readonly list: (options: {
    readonly prefix: string
    readonly cursor?: string
    readonly limit?: number
  }) => Promise<
    | {
        readonly objects: readonly { readonly key: string }[]
        readonly truncated: true
        readonly cursor: string
      }
    | { readonly objects: readonly { readonly key: string }[]; readonly truncated: false }
  >
  readonly delete: (keys: string[]) => Promise<void>
}

export type PurgeOutcome = { readonly ok: true; readonly deleted: number } | { readonly ok: false }

/**
 * Deletes every image a board has, a page at a time.
 *
 * Answers `ok: false` for ANY failure rather than throwing or carrying on: the
 * caller is about to throw away the board's keys, and a cleanup that half
 * worked must leave them in place so the owner can ask again. A retry starts
 * over from the prefix, so whatever a failed run did delete is simply not
 * found the second time.
 *
 * The prefix ends in a slash on purpose — `brd_a` must not match `brd_ab`.
 * 1000 is R2's own ceiling for one page of a listing and one bulk delete.
 */
export async function purgeBoardAssets(
  bucket: AssetBucket,
  boardId: string,
  pageSize = 1000,
): Promise<PurgeOutcome> {
  const prefix = assetKey(boardId, '')
  let deleted = 0
  let cursor: string | undefined
  try {
    for (;;) {
      const page = await bucket.list({
        prefix,
        limit: pageSize,
        ...(cursor === undefined ? {} : { cursor }),
      })
      const keys = page.objects.map((object) => object.key)
      if (keys.length > 0) {
        await bucket.delete(keys)
        deleted += keys.length
      }
      if (!page.truncated) return { ok: true, deleted }
      cursor = page.cursor
    }
  } catch {
    return { ok: false }
  }
}

export type UploadCheck =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly status: number; readonly reason: string }

/**
 * Reads an upload's body — never more than the ceiling — and holds its bytes
 * to the shared image policy before anything is written.
 *
 * `assetDecision` has already checked the declared type and the declared
 * length, but both are claims. This is where the room stops taking them on
 * trust: the body is read with a hard cap (a body longer than it said stops
 * being read the moment it passes the ceiling), its length must be what was
 * declared, and its leading bytes must be the format it claims to be. What
 * comes back is the bytes to store, so nothing reads the body twice.
 */
export async function checkUpload(
  contentType: string,
  declaredLength: number,
  body: ReadableStream<Uint8Array> | null,
): Promise<UploadCheck> {
  if (body === null) return { ok: false, status: 400, reason: 'An upload needs a body' }

  const chunks: Uint8Array[] = []
  let received = 0
  const reader = body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > MAX_ASSET_BYTES || received > declaredLength) {
      await reader.cancel()
      return { ok: false, status: 413, reason: 'That image is too large' }
    }
    chunks.push(value)
  }
  if (received !== declaredLength) {
    return { ok: false, status: 400, reason: 'The upload was not the size it said it was' }
  }

  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  const verdict = validateImage(contentType, bytes, received)
  if (!verdict.ok) {
    return verdict.failure.reason === 'too-large'
      ? { ok: false, status: 413, reason: 'That image is too large' }
      : { ok: false, status: 415, reason: 'That is not an image this board accepts' }
  }
  return { ok: true, bytes }
}
