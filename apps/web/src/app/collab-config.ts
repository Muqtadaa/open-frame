import { asBoardId, type BoardId } from '@openframe/core'

/**
 * Whether this build can put a board in a room, and which board it is opening.
 *
 * Every board made since 2026-09-19 is in a room from the moment it exists:
 * that is what makes the board list one kind of row and what makes a board
 * follow you between machines — the document lives in the room, so signing in
 * elsewhere finds the WORK and not just the name.
 *
 * Principle 4 is unaffected. It says a board works offline, and it does: the
 * CRDT and IndexedDB carry it with no connection. What needs the network is
 * MAKING one, because until the room exists there is nowhere for it to be.
 *
 * Boards from before that change have no room and are opened without one.
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
 * `?t=<token>` — proof that this browser knows the board's password.
 *
 * On the SOCKET only, never in a link anybody sends. A shareable URL carrying
 * the token would undo the whole feature: the password exists so that passing
 * the link on is not enough by itself.
 */
export const TOKEN_PARAM = 't'

/**
 * `?o=<key>` — the owner's key, on the SOCKET only.
 *
 * Deliberately not `k`. Were it a link it would sit in the page URL, and a URL
 * copied out of the address bar and passed on would carry the board's password
 * with it — which is the one thing the password exists to prevent.
 */
export const OWNER_PARAM = 'o'

/**
 * `?k=<key>` — which of a board's two links this is.
 *
 * The key IS the credential. It is in the URL rather than anywhere safer
 * because the whole point is that it can be pasted into a message: a link
 * somebody can send is the product requirement, and a link that carries a
 * secret is what that means. It never reaches storage and never reaches the
 * document.
 */
export const KEY_PARAM = 'k'

/** As minted by the room: 32 hex characters, 128 bits. */
const ACCESS_KEY = /^[0-9a-f]{32}$/

export function accessKey(search: string): string | null {
  const raw = new URLSearchParams(search).get(KEY_PARAM)
  return raw !== null && ACCESS_KEY.test(raw) ? raw : null
}

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

/**
 * Whether an id names a board that lives in a room.
 *
 * The two id shapes are the only way to tell a board's home apart once it is
 * sitting in IndexedDB: opening somebody's link writes a local COPY under the
 * shared id, and nothing about that row says it is a cache rather than a board
 * of yours.
 */
export function isSharedBoardId(boardId: string): boolean {
  return SHARED_ID.test(boardId)
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

export function shareLink(boardId: BoardId, origin: string, key?: string | null): string {
  const base = `${origin}/?${ROOM_PARAM}=${boardId}`
  return key === null || key === undefined ? base : `${base}&${KEY_PARAM}=${key}`
}

/**
 * ONE server, addressed two ways, because the platform insists.
 *
 * `new WebSocket()` throws on anything but ws/wss, and `fetch()` rejects those
 * two outright — so a single configured URL cannot be handed to both. It was,
 * and the consequence shipped: with `VITE_COLLAB_URL=wss://…` every press of
 * Share called `fetch('wss://…/claim')`, which a browser refuses before it
 * reaches the network, and the interface reported that the room server could
 * not be reached.
 *
 * Nothing caught it. The room suite claims rooms by writing `http://…` out by
 * hand instead of asking this module, so the one function with the bug in it
 * was the one function no test called.
 *
 * Converting in both directions also means the deployment cannot be configured
 * wrongly: either scheme now works, rather than one of the two halves failing
 * depending on which was chosen.
 */
function socketBase(): string {
  if (COLLAB_URL === null) throw new Error('No room server is configured for this build')
  return COLLAB_URL.replace(/^http/, 'ws')
}

function httpBase(): string {
  if (COLLAB_URL === null) throw new Error('No room server is configured for this build')
  return COLLAB_URL.replace(/^ws/, 'http')
}

export function roomSocketUrl(
  boardId: BoardId,
  key?: string | null,
  /** The token redeeming this board's password, for a board that has one. */
  token?: string | null,
  /** The owner's key, for the person whose board it is. */
  ownerKey?: string | null,
): string {
  const url = new URL(`${socketBase()}/room/${boardId}`)
  if (key !== null && key !== undefined) url.searchParams.set(KEY_PARAM, key)
  if (token !== null && token !== undefined) url.searchParams.set(TOKEN_PARAM, token)
  if (ownerKey !== null && ownerKey !== undefined) url.searchParams.set(OWNER_PARAM, ownerKey)
  return url.toString()
}

/** Where a board claimed before owner keys existed adopts one. */
export function ownerKeyUrl(boardId: BoardId): string {
  return `${httpBase()}/room/${boardId}/owner`
}

/** Where a board's password is set, changed or cleared. */
export function passwordUrl(boardId: BoardId): string {
  return `${httpBase()}/room/${boardId}/password`
}

/** Where a password is traded for the token that opens the board. */
export function unlockUrl(boardId: BoardId): string {
  return `${httpBase()}/room/${boardId}/unlock`
}

/** Where a board asks for its two links, once, before it holds anything. */
export function claimUrl(boardId: BoardId): string {
  return `${httpBase()}/room/${boardId}/claim`
}

/** Where a board's room is destroyed, taking every link to it with it. */
export function destroyUrl(boardId: BoardId): string {
  return `${httpBase()}/room/${boardId}/destroy`
}
