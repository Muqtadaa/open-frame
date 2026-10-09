import type { BoardId } from '@openframe/core'

/**
 * Where a board's room is.
 *
 * Here rather than in the web app because it is no longer the only client: the
 * MCP server joins the same rooms over the same sockets.
 *
 * The address carries NO credential. The link, the password token and the
 * owner's key go in the connection's first message (`MESSAGE_HELLO`,
 * `protocol.ts`), because an address is written down by every log on its way —
 * and the room refuses an address that carries one, so a client that still put
 * them there is told rather than quietly logged.
 */

/**
 * `?k=<key>` — which of a board's two links a PAGE was opened with. The share
 * link carries it, because a link is a thing people paste; the socket does not.
 */
export const KEY_PARAM = 'k'

/**
 * The socket URL for a board's room.
 *
 * Takes the server as HTTP or WebSocket and answers in ws/wss either way:
 * `new WebSocket()` throws on anything but ws/wss and `fetch()` refuses those
 * two outright, so one configured value cannot be handed to both. It was, and
 * the consequence shipped — every press of Share called `fetch('wss://…')`,
 * which a browser refuses before a packet moves.
 */
export function roomSocketUrl(server: string, boardId: BoardId): string {
  const base = server.replace(/\/+$/, '').replace(/^http/, 'ws')
  return new URL(`${base}/room/${boardId}`).toString()
}
