import { asBoardId, type BoardId } from '@openframe/core'

/**
 * Whether this build can put a board in a room, and which board it is opening.
 *
 * Collaboration is OPT IN, per board, and that follows from PRODUCT.md rather
 * than from caution: "a board works in one browser with no account and no
 * network" is principle 4, and making every board a room would quietly make a
 * server the price of starting. A board is shared when somebody shares it.
 */

/**
 * The room server, from the environment at build time.
 *
 * Absent in local development and in any deployment that has not been given
 * one, and everything downstream treats absent as "this build does not
 * collaborate" rather than failing to connect over and over.
 */
const CONFIGURED = import.meta.env.VITE_COLLAB_URL

export const COLLAB_URL: string | null =
  typeof CONFIGURED === 'string' && CONFIGURED.length > 0 ? CONFIGURED.replace(/\/+$/, '') : null

export const COLLAB_ENABLED = COLLAB_URL !== null

/** `?room=<id>` — the one piece of routing this application has. */
export const ROOM_PARAM = 'room'

/**
 * The shape a shared board id must have, checked here as well as in the Worker.
 *
 * The server's check is the one that matters — this one stops a malformed link
 * turning into a board nobody can open, and keeps the id out of IndexedDB where
 * it would persist the mistake.
 */
const SHARED_ID = /^brd_[A-Za-z0-9]{8,48}$/

export function sharedBoardId(search: string): BoardId | null {
  const raw = new URLSearchParams(search).get(ROOM_PARAM)
  if (raw === null || !SHARED_ID.test(raw)) return null
  return asBoardId(raw)
}

/** A new, unguessable board id. 16 base-36 characters is ~82 bits. */
export function newSharedBoardId(): BoardId {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
  let suffix = ''
  for (const byte of bytes) suffix += alphabet.charAt(byte % alphabet.length)
  return asBoardId(`brd_${suffix}`)
}

export function shareLink(boardId: BoardId, origin: string): string {
  return `${origin}/?${ROOM_PARAM}=${boardId}`
}

export function roomSocketUrl(boardId: BoardId): string {
  if (COLLAB_URL === null) throw new Error('No room server is configured for this build')
  return `${COLLAB_URL}/room/${boardId}`
}
