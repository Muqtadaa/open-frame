import { asBoardId } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { createRoomClient } from './room-client.js'

/**
 * The rooms worker's HTTP half, answered by a fake network.
 *
 * Every branch here used to be a raw `fetch` inside a use case, reachable in a
 * test only by replacing the global. The client takes its `fetch`, and each
 * status the worker gives a meaning to is pinned here once.
 */

const BOARD = asBoardId('room_test0000001')
const BASE = 'https://rooms.test'

interface Call {
  readonly url: string
  readonly body: unknown
}

function answering(
  status: number,
  body: unknown = {},
): { client: ReturnType<typeof createRoomClient>; calls: Call[] } {
  const calls: Call[] = []
  const client = createRoomClient({
    base: BASE,
    fetch: (input, init) => {
      calls.push({
        url: input instanceof Request ? input.url : input.toString(),
        body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      })
      return Promise.resolve(new Response(JSON.stringify(body), { status }))
    },
  })
  return { client, calls }
}

const offline = createRoomClient({
  base: BASE,
  fetch: () => Promise.reject(new TypeError('Failed to fetch')),
})

describe('claiming a room', () => {
  it('asks the room for its keys and hands them back', async () => {
    const { client, calls } = answering(200, { editor: 'e', viewer: 'v', owner: 'o' })
    expect(await client.claim(BOARD)).toEqual({
      ok: true,
      keys: { editor: 'e', viewer: 'v', owner: 'o' },
    })
    expect(calls[0]?.url).toBe(`${BASE}/room/${BOARD}/claim`)
  })

  it('says which way it failed', async () => {
    expect(await offline.claim(BOARD)).toEqual({ ok: false, reason: 'unreachable' })
    expect(await answering(409).client.claim(BOARD)).toEqual({ ok: false, reason: 'refused' })
    expect(await answering(200, { editor: 1 }).client.claim(BOARD)).toEqual({
      ok: false,
      reason: 'unreadable',
    })
  })
})

describe('adopting an owner key', () => {
  it('sends the edit key and returns the owner key', async () => {
    const { client, calls } = answering(200, { owner: 'minted' })
    expect(await client.adoptOwnerKey(BOARD, 'edit')).toBe('minted')
    expect(calls[0]).toEqual({ url: `${BASE}/room/${BOARD}/owner`, body: { key: 'edit' } })
  })

  it('answers null for every way of not getting one', async () => {
    expect(await offline.adoptOwnerKey(BOARD, 'edit')).toBeNull()
    expect(await answering(403).client.adoptOwnerKey(BOARD, 'edit')).toBeNull()
    expect(await answering(200, {}).client.adoptOwnerKey(BOARD, 'edit')).toBeNull()
  })
})

describe('unlocking', () => {
  it('trades the key and password for a token', async () => {
    const { client, calls } = answering(200, { token: 't' })
    expect(await client.unlock(BOARD, 'k', 'pw')).toEqual({ ok: true, token: 't' })
    expect(calls[0]).toEqual({
      url: `${BASE}/room/${BOARD}/unlock`,
      body: { key: 'k', password: 'pw' },
    })
  })

  it('tells being offline, being refused and a garbled answer apart', async () => {
    expect(await offline.unlock(BOARD, 'k', 'pw')).toEqual({ ok: false, reason: 'unreachable' })
    expect(await answering(403).client.unlock(BOARD, 'k', 'pw')).toEqual({
      ok: false,
      reason: 'refused',
    })
    expect(await answering(200, {}).client.unlock(BOARD, 'k', 'pw')).toEqual({
      ok: false,
      reason: 'unreadable',
    })
  })
})

describe('setting a password', () => {
  it('sends the owner key and the password, null to clear', async () => {
    const { client, calls } = answering(200)
    expect(await client.setPassword(BOARD, 'owner', null)).toEqual({ ok: true })
    expect(calls[0]).toEqual({
      url: `${BASE}/room/${BOARD}/password`,
      body: { key: 'owner', password: null },
    })
  })

  it("passes on the room's own reason for refusing", async () => {
    expect(await offline.setPassword(BOARD, 'owner', 'pw')).toEqual({
      ok: false,
      reason: 'unreachable',
    })
    expect(
      await answering(400, { error: 'Too short.' }).client.setPassword(BOARD, 'owner', 'pw'),
    ).toEqual({ ok: false, reason: 'refused', message: 'Too short.' })
    expect(await answering(403, {}).client.setPassword(BOARD, 'owner', 'pw')).toEqual({
      ok: false,
      reason: 'refused',
      message: null,
    })
  })
})

describe('destroying a room', () => {
  it('names each answer the worker gives', async () => {
    const { client, calls } = answering(200)
    expect(await client.destroy(BOARD, 'edit')).toBe('destroyed')
    expect(calls[0]).toEqual({ url: `${BASE}/room/${BOARD}/destroy`, body: { key: 'edit' } })
    // The key travels in the BODY. A credential in a query string is a
    // credential in an access log, and this is the destructive endpoint.
    expect(calls[0]?.url).not.toContain('edit')

    // Already gone is not a failure: a second delete must not strand the row.
    expect(await answering(410).client.destroy(BOARD, 'edit')).toBe('gone')
    // Shared before links had roles, so nobody can be trusted to destroy it.
    expect(await answering(409).client.destroy(BOARD, 'edit')).toBe('legacy')
    expect(await answering(403).client.destroy(BOARD, 'edit')).toBe('refused')
    expect(await offline.destroy(BOARD, 'edit')).toBe('unreachable')
  })
})

describe('asking whether a board has a password', () => {
  it('sends the key in the body and reads the answer', async () => {
    const { client, calls } = answering(200, { password: true })
    expect(await client.hasPassword(BOARD, 'k')).toBe(true)
    expect(calls[0]).toEqual({ url: `${BASE}/room/${BOARD}/protection`, body: { key: 'k' } })
    expect(await answering(200, { password: false }).client.hasPassword(BOARD, 'k')).toBe(false)
  })

  /*
   * Not knowing is not "no". A row that said "no password" because the
   * network blinked would be telling somebody their board is open when it is
   * not, so every failure answers `null` and the row says nothing.
   */
  it('answers null, not false, when it cannot tell', async () => {
    expect(await offline.hasPassword(BOARD, 'k')).toBeNull()
    expect(await answering(403).client.hasPassword(BOARD, 'k')).toBeNull()
    expect(await answering(200, {}).client.hasPassword(BOARD, 'k')).toBeNull()
  })
})
