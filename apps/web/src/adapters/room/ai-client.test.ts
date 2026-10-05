import { describe, expect, it } from 'vitest'

import { createAiClient } from './ai-client.js'

const request = {
  notes: [
    { ref: 'n1', text: 'a' },
    { ref: 'n2', text: 'b' },
    { ref: 'n3', text: 'c' },
  ],
}

const answering =
  (status: number, body: unknown): typeof globalThis.fetch =>
  () =>
    Promise.resolve(new Response(JSON.stringify(body), { status }))

const client = (fetch: typeof globalThis.fetch) =>
  createAiClient({ base: 'https://rooms.test', fetch })

describe('the AI client', () => {
  it('posts the notes with the bearer token, and nothing names an object', async () => {
    let asked: Request | null = null
    const ai = client((input, init) => {
      asked = new Request(input, init)
      return answering(200, {
        proposal: {
          title: 'T',
          clusters: [{ label: 'L', summary: 'S', refs: ['n1', 'n2'] }],
          unassigned: [],
        },
        remaining: 7,
      })(input, init)
    })
    const outcome = await ai.cluster(request, 'tok')
    expect(asked!.url).toBe('https://rooms.test/ai/cluster')
    expect(asked!.headers.get('authorization')).toBe('Bearer tok')
    expect(await asked!.json()).toEqual(request)
    // A note the answer forgot is kept, unassigned.
    expect(outcome).toEqual({
      kind: 'proposal',
      proposal: {
        title: 'T',
        clusters: [{ label: 'L', summary: 'S', refs: ['n1', 'n2'] }],
        unassigned: ['n3'],
      },
      remaining: 7,
    })
  })

  it('passes on why the server refused, and refuses an answer about notes it never sent', async () => {
    for (const why of ['signed-out', 'limit', 'declined', 'unconfigured'] as const) {
      expect(await client(answering(400, { outcome: why })).cluster(request, 't')).toEqual({
        kind: 'refused',
        why,
      })
    }
    expect(await client(answering(500, { outcome: 'nonsense' })).cluster(request, 't')).toEqual({
      kind: 'refused',
      why: 'failed',
    })
    const stranger = answering(200, {
      proposal: {
        title: 'T',
        clusters: [{ label: 'L', summary: '', refs: ['n9'] }],
        unassigned: [],
      },
      remaining: 1,
    })
    expect(await client(stranger).cluster(request, 't')).toEqual({
      kind: 'refused',
      why: 'invalid',
    })
    expect(
      await client(() => Promise.reject(new TypeError('offline'))).cluster(request, 't'),
    ).toEqual({ kind: 'refused', why: 'unreachable' })
  })
})
