import type { RoomRole } from '@openframe/collab'

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
 * What an image may be, checked AGAIN on the server.
 *
 * The web app already checks size, declared type and sniffed bytes before an
 * upload starts (rule 19), and none of that binds anybody who skips the web
 * app. A client-side check is a courtesy to the user; this is the one that
 * decides what ends up in the bucket.
 *
 * SVG is absent for the same reason it is absent there: it is a document that
 * can carry scripts and external references, and a half-sanitised one is worse
 * than a rejected one because it looks handled.
 */
const ALLOWED_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
]

/**
 * The ceiling, in bytes.
 *
 * Generous enough for a photograph and small enough that a board cannot be
 * used as free file hosting. The web app's own limit is lower; this is the
 * one that holds when the web app is not involved.
 */
export const MAX_ASSET_BYTES = 12 * 1024 * 1024

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

  if (request.role === null) {
    // The same answer for a wrong key and a missing one. Distinguishing them
    // tells somebody probing which half of the guess to keep.
    return { ok: false, status: 403, reason: 'That link does not open this board' }
  }

  /*
   * Checked after the link, so a request without a valid key learns nothing
   * about whether the board is protected — it gets the same 403 either way.
   */
  if (!request.owner && !request.unlocked) {
    return { ok: false, status: 403, reason: 'That link does not open this board' }
  }

  if (!writing) return { ok: true, write: false }

  if (request.role !== 'editor') {
    return { ok: false, status: 403, reason: 'That link cannot add to this board' }
  }

  const declared = (request.contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  if (!ALLOWED_TYPES.includes(declared)) {
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
