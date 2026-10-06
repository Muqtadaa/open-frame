import { asBoardId } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { createRoomHistory } from './history-client.js'

const ID = '0001789000000000-00ff00ff'

async function gzip(text: string): Promise<ArrayBuffer> {
  const body = new Response(text).body
  if (body === null) throw new Error('no body')
  const stream = body.pipeThrough(new CompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

function history(answer: (url: string, init?: RequestInit) => Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = []
  const client = createRoomHistory({
    base: 'https://rooms.example',
    boardId: asBoardId('brd_one'),
    credentials: () => ({ key: 'k'.repeat(32), owner: null, token: 't' }),
    decode: (bytes) =>
      Promise.resolve({ title: new TextDecoder().decode(bytes), objects: [{ id: 'obj_a' }] }),
    fetch: (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      calls.push(init === undefined ? { url } : { url, init })
      return answer(url, init)
    },
  })
  return { client, calls }
}

describe('a shared board’s history, read from its room', () => {
  it('lists versions newest first, leaving out anything malformed', async () => {
    const { client, calls } = history(() =>
      Promise.resolve(
        Response.json({
          versions: [
            { id: '0001789000000000-00000000', at: 1, kind: 'auto' },
            { id: '0001789000000001-00000000', at: 2, kind: 'named', name: 'Kickoff' },
            { id: '../asset', at: 3, kind: 'auto' },
            { id: '0001789000000002-00000000', at: 'soon', kind: 'auto' },
          ],
        }),
      ),
    )
    expect(await client.list()).toEqual([
      { id: '0001789000000001-00000000', at: 2, kind: 'named', name: 'Kickoff' },
      { id: '0001789000000000-00000000', at: 1, kind: 'auto' },
    ])
    // Credentials in headers, never in the URL.
    expect(calls[0]?.url).toBe('https://rooms.example/room/brd_one/versions')
    expect(calls[0]?.init?.headers).toMatchObject({
      'x-openframe-key': 'k'.repeat(32),
      'x-openframe-token': 't',
    })
  })

  it('opens a version: gunzipped, then decoded', async () => {
    const bytes = await gzip('Plans')
    const { client } = history(() => Promise.resolve(new Response(bytes)))
    expect(await client.open(ID)).toEqual({
      status: 'ok',
      title: 'Plans',
      objects: [{ id: 'obj_a' }],
    })
  })

  it('says which way opening failed', async () => {
    expect(
      await history(() => Promise.resolve(new Response('', { status: 404 }))).client.open(ID),
    ).toEqual({ status: 'missing' })
    expect(await history(() => Promise.reject(new Error('offline'))).client.open(ID)).toEqual({
      status: 'unreachable',
    })
    // Not gzip at all: the bytes cannot be opened.
    expect(
      await history(() => Promise.resolve(new Response('plain'))).client.open(ID),
    ).toMatchObject({ status: expect.stringMatching(/unreachable|unreadable/) as unknown })
    // An id of the wrong shape never reaches the network.
    const { client, calls } = history(() => Promise.resolve(new Response('')))
    expect(await client.open('../asset/x')).toEqual({ status: 'missing' })
    expect(calls).toHaveLength(0)
  })

  it('asks the room to keep the board as it is, and says whether it did', async () => {
    const { client, calls } = history(() => Promise.resolve(Response.json({ kept: true })))
    expect(await client.keepNow()).toBe(true)
    expect(calls[0]?.init?.method).toBe('POST')
    expect(
      await history(() => Promise.resolve(new Response('', { status: 403 }))).client.keepNow(),
    ).toBe(false)
  })

  it('names a version with a JSON body, checked before it is sent', async () => {
    const { client, calls } = history(() => Promise.resolve(Response.json({ version: {} })))
    expect(await client.name('  Kickoff ')).toBe(true)
    expect(calls[0]?.init?.method).toBe('POST')
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ name: 'Kickoff' }))
    expect(calls[0]?.init?.headers).toMatchObject({ 'content-type': 'application/json' })
    // A name the room would refuse never reaches it.
    expect(await client.name('')).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it('deletes a version by id, and says whether the room did', async () => {
    const { client, calls } = history(() => Promise.resolve(new Response(null, { status: 204 })))
    expect(await client.forget(ID)).toBe(true)
    expect(calls[0]?.url).toBe(`https://rooms.example/room/brd_one/versions/${ID}`)
    expect(calls[0]?.init?.method).toBe('DELETE')
    // An automatic version is refused by the room.
    expect(
      await history(() => Promise.resolve(new Response('', { status: 409 }))).client.forget(ID),
    ).toBe(false)
    expect(await client.forget('../asset/x')).toBe(false)
    expect(calls).toHaveLength(1)
  })
})
