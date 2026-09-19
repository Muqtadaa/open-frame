import { describe, expect, it } from 'vitest'

import { routeRequest } from './route.js'

const at = (path: string, upgrade: string | null = 'websocket') =>
  routeRequest(new URL(`https://rooms.example${path}`), upgrade)

describe('routing a request to a board', () => {
  it('sends a websocket upgrade to the named board', () => {
    expect(at('/room/brd_abc123')).toEqual({ kind: 'room', boardId: 'brd_abc123' })
  })

  it('tolerates a trailing slash', () => {
    expect(at('/room/brd_abc123/')).toEqual({ kind: 'room', boardId: 'brd_abc123' })
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
    expect(at('/room/brd_abc123', 'WebSocket')).toEqual({ kind: 'room', boardId: 'brd_abc123' })
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
