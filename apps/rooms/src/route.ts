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
const CLAIM_PATH = /^\/room\/([^/]+)\/claim\/?$/
const DESTROY_PATH = /^\/room\/([^/]+)\/destroy\/?$/
const PASSWORD_PATH = /^\/room\/([^/]+)\/password\/?$/
const UNLOCK_PATH = /^\/room\/([^/]+)\/unlock\/?$/
const OWNER_PATH = /^\/room\/([^/]+)\/owner\/?$/

/**
 * The shape of an access key.
 *
 * A key is the whole of a link's authority, so the only thing this check does
 * is keep a malformed one from reaching storage comparison — the LENGTH is
 * what makes it unguessable, and that is decided where keys are minted.
 */
const ACCESS_KEY = /^[A-Za-z0-9_-]{16,64}$/

/** `?k=<key>` — which link this connection arrived on. */
export const KEY_PARAM = 'k'

export type Route =
  | { readonly kind: 'health' }
  | {
      readonly kind: 'room'
      readonly boardId: string
      /** `null` means the link carried no key, which only a legacy room accepts. */
      readonly key: string | null
    }
  /** Minting the two links for a board that does not have them yet. */
  | { readonly kind: 'claim'; readonly boardId: string }
  /**
   * Destroying a room and everything in it.
   *
   * A POST rather than a DELETE, and the key travels in the BODY rather than
   * the query string. Both follow from it being destructive: a DELETE would
   * need its own preflight allowance, and a credential in a URL is a
   * credential in an access log. The socket already carries its key in the
   * query because a link is a thing people paste; nothing here is.
   */
  | { readonly kind: 'destroy'; readonly boardId: string }
  /** Set, change or clear this board's password. The editor key only. */
  | { readonly kind: 'password'; readonly boardId: string }
  /** Redeem the password for the token that opens the board. Either key. */
  | { readonly kind: 'unlock'; readonly boardId: string }
  /** Mint this board's owner key, once, for a board claimed before they existed. */
  | { readonly kind: 'owner'; readonly boardId: string }
  /** A CORS preflight for the above: the web app is on another origin. */
  | { readonly kind: 'preflight' }
  | { readonly kind: 'refuse'; readonly status: number; readonly reason: string }

/** Path, route kind and the name used in "X is a POST". */
const POSTS = [
  [CLAIM_PATH, 'claim', 'Claim'],
  [DESTROY_PATH, 'destroy', 'Destroy'],
  [PASSWORD_PATH, 'password', 'Setting a password'],
  [UNLOCK_PATH, 'unlock', 'Unlocking'],
  [OWNER_PATH, 'owner', 'Adopting an owner key'],
] as const satisfies readonly (readonly [RegExp, Route['kind'], string])[]

export function routeRequest(url: URL, upgradeHeader: string | null, method = 'GET'): Route {
  if (url.pathname === '/health') return { kind: 'health' }

  /*
   * The POST endpoints, which differ only in their path and their name. There
   * were two of these written out longhand; five would have been four copies
   * of the same board-id check, and the fifth is where one of them quietly
   * stops matching the others.
   */
  for (const [pattern, kind, name] of POSTS) {
    const match = pattern.exec(url.pathname)
    if (match === null) continue
    const boardId = match[1]
    if (boardId === undefined || !BOARD_ID.test(boardId)) {
      return { kind: 'refuse', status: 400, reason: 'That is not a board id' }
    }
    if (method === 'OPTIONS') return { kind: 'preflight' }
    if (method !== 'POST') return { kind: 'refuse', status: 405, reason: `${name} is a POST` }
    return { kind, boardId }
  }

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

  /*
   * A malformed key is dropped rather than refused, so it reaches the room as
   * "no key" and gets the same answer as a link without one. Refusing here
   * would tell somebody probing the endpoint that the SHAPE of their guess was
   * wrong, which is a hint they have no business getting.
   */
  const rawKey = url.searchParams.get(KEY_PARAM)
  const key = rawKey !== null && ACCESS_KEY.test(rawKey) ? rawKey : null

  return { kind: 'room', boardId, key }
}
