import { describe, expect, it } from 'vitest'

import { routeRequest } from './route.js'

const at = (path: string, upgrade: string | null = 'websocket') =>
  routeRequest(new URL(`https://rooms.example${path}`), upgrade)

describe('routing a request to a board', () => {
  it('sends a websocket upgrade to the named board', () => {
    expect(at('/room/brd_abc123')).toEqual({ kind: 'room', boardId: 'brd_abc123', key: null })
  })

  it('tolerates a trailing slash', () => {
    expect(at('/room/brd_abc123/')).toEqual({ kind: 'room', boardId: 'brd_abc123', key: null })
  })

  it('answers a health check without a socket', () => {
    expect(at('/health', null)).toEqual({ kind: 'health' })
  })

  it('refuses a plain request to a room', () => {
    expect(at('/room/brd_abc123', null)).toMatchObject({ kind: 'refuse', status: 426 })
  })

  /** A proxy may normalise the header's case, and rejecting that would be a bug
   * reachable only through somebody's corporate network. */
  it('accepts the upgrade header in any case', () => {
    expect(at('/room/brd_abc123', 'WebSocket')).toEqual({ kind: 'room', boardId: 'brd_abc123', key: null })
  })

  it('has nothing at the root', () => {
    expect(at('/')).toMatchObject({ kind: 'refuse', status: 404 })
  })
})

/**
 * Naming a Durable Object is what CREATES it, so this is the check that stops
 * anyone filling the account with rooms by spelling out nonsense — and stops a
 * board id carrying anything that means something to a router.
 */
describe('board ids that must not reach a Durable Object', () => {
  it.each([
    ['empty', '/room/'],
    ['a path traversal', '/room/..'],
    ['a nested path', '/room/a/b'],
    ['a url-encoded slash', '/room/a%2Fb'],
    ['a space', '/room/a b'],
    ['a dot', '/room/a.b'],
    ['64 characters and one more', `/room/${'a'.repeat(65)}`],
  ])('refuses %s', (_name, path) => {
    expect(at(path).kind).toBe('refuse')
  })

  it('allows exactly 64 characters', () => {
    expect(at(`/room/${'a'.repeat(64)}`).kind).toBe('room')
  })
})

describe('the access key on a link', () => {
  const ws = 'websocket'

  it('is carried through to the room', () => {
    const key = 'a'.repeat(32)
    expect(routeRequest(new URL(`https://r.dev/room/brd_one?k=${key}`), ws)).toEqual({
      kind: 'room',
      boardId: 'brd_one',
      key,
    })
  })

  it('is absent for a link that has none, which only a legacy room accepts', () => {
    expect(routeRequest(new URL('https://r.dev/room/brd_one'), ws)).toEqual({
      kind: 'room',
      boardId: 'brd_one',
      key: null,
    })
  })

  /**
   * Dropped rather than refused. A 400 for a malformed key tells somebody
   * probing the endpoint that the SHAPE of their guess was wrong, which is a
   * hint they have no business getting; reaching the room as "no key" gets
   * them the same answer as an ordinary link without one.
   */
  it('is dropped, not refused, when it is the wrong shape', () => {
    for (const bad of ['short', '../etc/passwd', 'a'.repeat(200), '']) {
      expect(routeRequest(new URL(`https://r.dev/room/brd_one?k=${encodeURIComponent(bad)}`), ws)).toEqual(
        { kind: 'room', boardId: 'brd_one', key: null },
      )
    }
  })
})

describe('claiming the links for a board', () => {
  it('is a POST to the board’s claim path', () => {
    expect(routeRequest(new URL('https://r.dev/room/brd_one/claim'), null, 'POST')).toEqual({
      kind: 'claim',
      boardId: 'brd_one',
    })
  })

  it('answers the browser’s preflight, without naming a room', () => {
    expect(routeRequest(new URL('https://r.dev/room/brd_one/claim'), null, 'OPTIONS')).toEqual({
      kind: 'preflight',
    })
  })

  it('refuses any other method', () => {
    const route = routeRequest(new URL('https://r.dev/room/brd_one/claim'), null, 'GET')
    expect(route).toEqual({ kind: 'refuse', status: 405, reason: 'Claim is a POST' })
  })

  it('validates the board id before anything else', () => {
    const route = routeRequest(new URL('https://r.dev/room/..%2F..%2Fetc/claim'), null, 'POST')
    expect(route.kind).toBe('refuse')
  })

  /** A claim is not a socket, so it must not be held to the upgrade check. */
  it('does not require a websocket upgrade', () => {
    expect(routeRequest(new URL('https://r.dev/room/brd_one/claim'), null, 'POST').kind).toBe(
      'claim',
    )
  })
})
