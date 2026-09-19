import { asBoardId, type BoardId } from '@openframe/core'

import { accessKey, ROOM_PARAM, sharedBoardId } from './collab-config.js'

/**
 * The whole of this application's routing, still in a query string.
 *
 * Two surfaces now instead of one, which is the threshold the deferred
 * decisions table set for earning a real router — and it is not met. A router
 * buys nested routes, route-level code splitting and a history abstraction;
 * this needs none of them, and every one of them is a dependency that has to
 * be understood by whoever reads `main.tsx` next.
 *
 * Navigation is a full page load, deliberately. `createRuntime` opens exactly
 * one board and the whole application is wired around it before React renders;
 * a client-side transition would mean tearing that down and rebuilding it,
 * which is a second lifecycle for the sake of saving a reload the splash
 * already covers.
 */

/** A local board, in this browser only. `?board=<id>`. */
export const BOARD_PARAM = 'board'

/**
 * The shape of a local board id.
 *
 * Checked because the id reaches IndexedDB and the URL, and because a board
 * that cannot be named cannot be opened again — a malformed id would persist
 * the mistake rather than fail visibly.
 */
const LOCAL_ID = /^board_[A-Za-z0-9-]{1,48}$/

export type Route =
  /** The entry surface: sign in, or pick up a board, or start one. */
  | { readonly kind: 'home' }
  | {
      readonly kind: 'board'
      readonly boardId: BoardId
      readonly shared: boolean
      /**
       * Which of the board's two links this is, for a shared board.
       *
       * `null` on a link with no key — either a local board, or one shared
       * before links had roles, which the room still admits as an editor.
       */
      readonly key: string | null
    }

export function readRoute(search: string): Route {
  const shared = sharedBoardId(search)
  if (shared !== null) {
    return { kind: 'board', boardId: shared, shared: true, key: accessKey(search) }
  }

  const raw = new URLSearchParams(search).get(BOARD_PARAM)
  if (raw !== null && LOCAL_ID.test(raw)) {
    return { kind: 'board', boardId: asBoardId(raw), shared: false, key: null }
  }

  /*
   * Anything unrecognised is home rather than an error. A truncated or mangled
   * link is far more likely than a hostile one, and home is a place somebody
   * can recover from — a 404 is not.
   */
  return { kind: 'home' }
}

export function boardHref(boardId: BoardId, shared: boolean): string {
  return `/?${shared ? ROOM_PARAM : BOARD_PARAM}=${encodeURIComponent(boardId)}`
}

export const HOME_HREF = '/'

/** A new local board. Short enough to read in a URL, unique enough to be one. */
export function newLocalBoardId(): BoardId {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
  let suffix = ''
  for (const byte of bytes) suffix += alphabet.charAt(byte % alphabet.length)
  return asBoardId(`board_${suffix}`)
}
