import type { BoardId } from '@openframe/core'

/**
 * Where a board's room is, and what a connection claims about itself on the
 * way in.
 *
 * Here rather than in the web app because it is no longer the only client. The
 * MCP server joins the same rooms over the same sockets, and a second
 * transcription of `?k=…&t=…&o=…` is one chance for the two to disagree about
 * a credential — in a query string the room reads as authority.
 *
 * The room's own parser (`apps/rooms/src/route.ts`) is the other end of this
 * contract and deliberately keeps its own copy: it must not trust a client
 * package for what it accepts.
 */

/**
 * `?k=<key>` — which of a board's two links this connection arrived on.
 *
 * The key IS the credential. It travels in the URL because the whole point is
 * that a link can be pasted into a message.
 */
export const KEY_PARAM = 'k'

/**
 * `?t=<token>` — proof that this client knows the board's password.
 *
 * On the SOCKET only, never in a link anybody sends: a shareable URL carrying
 * the token would undo the feature, since the password exists so that passing
 * the link on is not enough by itself.
 */
export const TOKEN_PARAM = 't'

/**
 * `?o=<key>` — the owner's key.
 *
 * Deliberately not `k`. Were it a link it would sit in the address bar, and a
 * URL copied out of there and passed on would carry the board's password with
 * it — the one thing the password exists to prevent.
 */
export const OWNER_PARAM = 'o'

/** What a connection claims about itself. Each part is absent or a string. */
export interface RoomCredentials {
  /** Which link this is. `null` for a room claimed before keys existed. */
  readonly key?: string | null | undefined
  /** Redeems the board's password, for a board that has one. */
  readonly token?: string | null | undefined
  /** The owner's key, for the person whose board it is. */
  readonly ownerKey?: string | null | undefined
}

/**
 * The socket URL for a board's room.
 *
 * Takes the server as HTTP or WebSocket and answers in ws/wss either way:
 * `new WebSocket()` throws on anything but ws/wss and `fetch()` refuses those
 * two outright, so one configured value cannot be handed to both. It was, and
 * the consequence shipped — every press of Share called `fetch('wss://…')`,
 * which a browser refuses before a packet moves.
 */
export function roomSocketUrl(
  server: string,
  boardId: BoardId,
  credentials: RoomCredentials = {},
): string {
  const base = server.replace(/\/+$/, '').replace(/^http/, 'ws')
  const url = new URL(`${base}/room/${boardId}`)
  const put = (param: string, value: string | null | undefined): void => {
    if (value !== null && value !== undefined) url.searchParams.set(param, value)
  }
  put(KEY_PARAM, credentials.key)
  put(TOKEN_PARAM, credentials.token)
  put(OWNER_PARAM, credentials.ownerKey)
  return url.toString()
}
