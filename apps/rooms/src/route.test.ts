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
    expect(at('/room/brd_abc123', 'WebSocket')).toEqual({
      kind: 'room',
      boardId: 'brd_abc123',
      key: null,
    })
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
      expect(
        routeRequest(new URL(`https://r.dev/room/brd_one?k=${encodeURIComponent(bad)}`), ws),
      ).toEqual({ kind: 'room', boardId: 'brd_one', key: null })
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

describe('destroying a room', () => {
  it('routes a POST to the board it names', () => {
    expect(routeRequest(new URL('https://r.test/room/brd_abc/destroy'), null, 'POST')).toEqual({
      kind: 'destroy',
      boardId: 'brd_abc',
    })
  })

  /**
   * The web app is on another origin and the request carries a JSON body, so
   * the browser asks first. Without this the destroy never leaves the page.
   */
  it('answers the preflight the body forces', () => {
    expect(routeRequest(new URL('https://r.test/room/brd_abc/destroy'), null, 'OPTIONS')).toEqual({
      kind: 'preflight',
    })
  })

  it('refuses any other method rather than guessing', () => {
    expect(routeRequest(new URL('https://r.test/room/brd_abc/destroy'), null, 'GET')).toMatchObject(
      {
        kind: 'refuse',
        status: 405,
      },
    )
  })

  /**
   * A Durable Object is created by being NAMED, so an unchecked id here is a
   * way to fill the account with rooms — and `/destroy` must not be the hole
   * the other two paths do not have.
   */
  it('refuses a board id of the wrong shape', () => {
    expect(
      routeRequest(new URL('https://r.test/room/not%20a%20board/destroy'), null, 'POST'),
    ).toMatchObject({ kind: 'refuse', status: 400 })
  })

  /** The room path must not swallow it: `/room/x/destroy` is not `/room/x`. */
  it('is not mistaken for the socket path', () => {
    const route = routeRequest(new URL('https://r.test/room/brd_abc/destroy'), 'websocket', 'POST')
    expect(route.kind).toBe('destroy')
  })
})

/**
 * The asset endpoints.
 *
 * The credential travels in a HEADER rather than the query string, which is
 * why nothing here parses a key: the room reads the headers. That is the same
 * reasoning `destroy` follows — the socket's key is in the URL because a link
 * is a thing people paste, and an image request is not.
 */
describe('one image on a board', () => {
  const at = (path: string, method: string) =>
    routeRequest(new URL(`https://rooms.example${path}`), null, method)

  it('routes a read and a write', () => {
    expect(at('/room/brd_1/asset/ast_2', 'GET')).toEqual({
      kind: 'asset',
      boardId: 'brd_1',
      assetId: 'ast_2',
    })
    expect(at('/room/brd_1/asset/ast_2', 'PUT')).toMatchObject({ kind: 'asset' })
  })

  it('answers the preflight, since this is a cross-origin request with headers', () => {
    expect(at('/room/brd_1/asset/ast_2', 'OPTIONS')).toEqual({ kind: 'preflight' })
  })

  it('refuses any other method', () => {
    expect(at('/room/brd_1/asset/ast_2', 'POST')).toMatchObject({ kind: 'refuse', status: 405 })
    expect(at('/room/brd_1/asset/ast_2', 'DELETE')).toMatchObject({ kind: 'refuse', status: 405 })
  })

  /*
   * An asset id becomes a key in a bucket, so anything a path allows but a key
   * should not carry is refused before it reaches storage.
   */
  it('refuses an id that could mean something to a bucket', () => {
    expect(at('/room/brd_1/asset/../../secret', 'GET')).toMatchObject({ kind: 'refuse' })
    expect(at('/room/brd_1/asset/a b', 'GET')).toMatchObject({ kind: 'refuse' })
    expect(at('/room/brd_1/asset/', 'GET')).toMatchObject({ kind: 'refuse' })
  })

  it('refuses a board id that is not one', () => {
    expect(at('/room/not a board/asset/ast_2', 'GET')).toMatchObject({
      kind: 'refuse',
      status: 400,
    })
  })

  /* The socket route must still be the socket route. */
  it('does not swallow the room path', () => {
    expect(routeRequest(new URL('https://rooms.example/room/brd_1'), 'websocket')).toMatchObject({
      kind: 'room',
    })
  })
})

describe('a board’s earlier versions', () => {
  const at = (path: string, method: string) =>
    routeRequest(new URL(`https://rooms.example${path}`), null, method)
  const id = '0001789000000000-00ff00ff'

  it('routes the list and one version', () => {
    expect(at('/room/brd_1/versions', 'GET')).toEqual({ kind: 'versions', boardId: 'brd_1' })
    expect(at(`/room/brd_1/versions/${id}`, 'GET')).toEqual({
      kind: 'version',
      boardId: 'brd_1',
      versionId: id,
    })
  })

  it('answers the preflight, keeps a version on a POST, and refuses anything else', () => {
    expect(at('/room/brd_1/versions', 'OPTIONS')).toEqual({ kind: 'preflight' })
    expect(at('/room/brd_1/versions', 'POST')).toEqual({ kind: 'keep-version', boardId: 'brd_1' })
    expect(at(`/room/brd_1/versions/${id}`, 'DELETE')).toEqual({
      kind: 'forget-version',
      boardId: 'brd_1',
      versionId: id,
    })
    expect(at('/room/brd_1/versions', 'DELETE')).toMatchObject({ kind: 'refuse', status: 405 })
    expect(at(`/room/brd_1/versions/${id}`, 'POST')).toMatchObject({ kind: 'refuse', status: 405 })
    expect(at(`/room/brd_1/versions/${id}`, 'PUT')).toMatchObject({ kind: 'refuse', status: 405 })
  })

  it('refuses an id that is not a version’s, before it reaches a bucket', () => {
    expect(at('/room/brd_1/versions/0001789000000000-00FF00FF', 'GET')).toMatchObject({
      kind: 'refuse',
    })
    expect(at('/room/brd_1/versions/a%2Fb', 'GET')).toMatchObject({ kind: 'refuse' })
    expect(at('/room/brd_1/versions/ast_2', 'GET')).toMatchObject({ kind: 'refuse' })
    expect(at('/room/not a board/versions', 'GET')).toMatchObject({ kind: 'refuse', status: 400 })
  })
})

describe('asking whether a board has a password', () => {
  it('is a POST to the board’s protection path', () => {
    expect(routeRequest(new URL('https://r.dev/room/brd_one/protection'), null, 'POST')).toEqual({
      kind: 'protection',
      boardId: 'brd_one',
    })
  })

  it('refuses any other method, and a malformed board id', () => {
    expect(
      routeRequest(new URL('https://r.dev/room/brd_one/protection'), null, 'GET'),
    ).toMatchObject({ kind: 'refuse', status: 405 })
    expect(
      routeRequest(new URL('https://r.dev/room/..%2Fx/protection'), null, 'POST'),
    ).toMatchObject({ kind: 'refuse', status: 400 })
  })
})

/*
 * Session music (ADR 0017): served by the worker itself, to anyone. The tracks
 * are CC0 and the same for every board, so there is no board and no key in
 * the path — an `<audio>` element could not send a header anyway.
 */
describe('the music library', () => {
  const music = (path: string, method = 'GET') =>
    routeRequest(new URL(`https://r.dev${path}`), null, method)

  it('serves its catalogue', () => {
    expect(music('/music/catalogue')).toEqual({ kind: 'catalogue' })
  })

  it('serves a track by its id, for a GET or a HEAD', () => {
    expect(music('/music/track/calm-1')).toEqual({ kind: 'track', trackId: 'calm-1' })
    expect(music('/music/track/calm-1', 'HEAD')).toEqual({ kind: 'track', trackId: 'calm-1' })
  })

  it('answers a preflight, and refuses a write', () => {
    expect(music('/music/track/calm-1', 'OPTIONS')).toEqual({ kind: 'preflight' })
    expect(music('/music/track/calm-1', 'PUT')).toMatchObject({ kind: 'refuse', status: 405 })
    expect(music('/music/catalogue', 'POST')).toMatchObject({ kind: 'refuse', status: 405 })
  })

  it('refuses an id that is not one', () => {
    expect(music('/music/track/..%2Fsecret')).toMatchObject({ kind: 'refuse', status: 404 })
    expect(music('/music/track/UPPER')).toMatchObject({ kind: 'refuse', status: 404 })
  })
})

describe('asking the AI to cluster notes', () => {
  const ai = (method: string, path = '/ai/cluster') =>
    routeRequest(new URL(`https://r.dev${path}`), null, method)

  it('is a POST, with or without a trailing slash, and names no room', () => {
    expect(ai('POST')).toEqual({ kind: 'ai-cluster' })
    expect(ai('POST', '/ai/cluster/')).toEqual({ kind: 'ai-cluster' })
  })

  it('answers the preflight the bearer header forces', () => {
    expect(ai('OPTIONS')).toEqual({ kind: 'preflight' })
  })

  it('refuses any other method', () => {
    expect(ai('GET')).toEqual({ kind: 'refuse', status: 405, reason: 'Clustering is a POST' })
  })
})

describe('asking the AI to summarise notes', () => {
  const ai = (method: string, path = '/ai/summary') =>
    routeRequest(new URL(`https://r.dev${path}`), null, method)

  it('is a POST, with or without a trailing slash, and names no room', () => {
    expect(ai('POST')).toEqual({ kind: 'ai-summary' })
    expect(ai('POST', '/ai/summary/')).toEqual({ kind: 'ai-summary' })
  })

  it('answers the preflight and refuses any other method', () => {
    expect(ai('OPTIONS')).toEqual({ kind: 'preflight' })
    expect(ai('GET')).toEqual({ kind: 'refuse', status: 405, reason: 'Summarising is a POST' })
  })
})
