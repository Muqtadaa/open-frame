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

describe('the AI client, summarising', () => {
  const two = { notes: request.notes.slice(0, 2), frame: 'Interviews' }
  const summary = { title: 'T', points: [{ text: 'P', refs: ['n1', 'n1'] }] }

  it('posts to /ai/summary and checks the summary against the notes it sent', async () => {
    let asked: Request | null = null
    const ai = client((input, init) => {
      asked = new Request(input, init)
      return answering(200, { summary, remaining: 3 })(input, init)
    })
    const outcome = await ai.summarise(two, 'tok')
    expect(asked!.url).toBe('https://rooms.test/ai/summary')
    expect(asked!.headers.get('authorization')).toBe('Bearer tok')
    expect(await asked!.json()).toEqual(two)
    expect(outcome).toEqual({
      kind: 'summary',
      summary: { title: 'T', points: [{ text: 'P', refs: ['n1'] }] },
      remaining: 3,
    })
  })

  it('refuses a summary citing a note it never sent, and passes on the server’s refusal', async () => {
    const stranger = answering(200, {
      summary: { title: 'T', points: [{ text: 'P', refs: ['n9'] }] },
      remaining: 1,
    })
    expect(await client(stranger).summarise(two, 't')).toEqual({ kind: 'refused', why: 'invalid' })
    expect(await client(answering(429, { outcome: 'limit' })).summarise(two, 't')).toEqual({
      kind: 'refused',
      why: 'limit',
    })
  })

  it('never sends one note: the server would refuse it the same way', async () => {
    let sent = false
    const ai = client(() => {
      sent = true
      return answering(200, {})('', {})
    })
    expect(await ai.summarise({ notes: request.notes.slice(0, 1) }, 't')).toEqual({
      kind: 'refused',
      why: 'too-large',
    })
    expect(sent).toBe(false)
  })
})
