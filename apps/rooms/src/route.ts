/**
 * Which board a request is for, decided without touching the runtime.
 *
 * Separated from `index.ts` so it can be tested in Node: everything here is a
 * URL and a header in, a decision out. The module that knows about Durable
 * Objects imports `cloudflare:workers` and can only run inside workerd, and a
 * guard that can only be exercised by deploying is a guard nobody exercises.
 */

/**
 * The shape of a board id.
 *
 * This is a security check, not tidiness. A Durable Object is created by being
 * NAMED, so an unvalidated id lets anyone fill the account with rooms by
 * spelling out garbage — and the charset is narrower than a URL path allows, so
 * a board id cannot carry anything that means something to a router.
 */
const BOARD_ID = /^[A-Za-z0-9_-]{1,64}$/

const ROOM_PATH = /^\/room\/([^/]+)\/?$/

export type Route =
  | { readonly kind: 'health' }
  | { readonly kind: 'room'; readonly boardId: string }
  | { readonly kind: 'refuse'; readonly status: number; readonly reason: string }

export function routeRequest(url: URL, upgradeHeader: string | null): Route {
  if (url.pathname === '/health') return { kind: 'health' }

  const match = ROOM_PATH.exec(url.pathname)
  if (match === null) return { kind: 'refuse', status: 404, reason: 'Not found' }

  const boardId = match[1]
  if (boardId === undefined || !BOARD_ID.test(boardId)) {
    return { kind: 'refuse', status: 400, reason: 'That is not a board id' }
  }

  /*
   * Case-insensitive because the header is: browsers send `Upgrade: websocket`
   * but nothing in the spec stops a proxy normalising it to `WebSocket`, and
   * rejecting that would be a bug reachable only through somebody's corporate
   * network.
   */
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return { kind: 'refuse', status: 426, reason: 'This endpoint speaks WebSocket' }
  }

  return { kind: 'room', boardId }
}
