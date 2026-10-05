import { describe, expect, it } from 'vitest'

import { askClaude } from './claude.js'

const request = {
  notes: [
    { ref: 'n1', text: 'a' },
    { ref: 'n2', text: 'b' },
    { ref: 'n3', text: 'c' },
  ],
}

/** Answers as the Messages API would, and keeps what it was asked. */
function upstream(stopReason: string, text = '{}') {
  const seen: { url: string; headers: Headers; body: Record<string, unknown> }[] = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const asked = new Request(input, init)
    seen.push({
      url: asked.url,
      headers: asked.headers,
      body: await asked.json(),
    })
    return new Response(
      JSON.stringify({
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [{ type: 'text', text }],
        stop_reason: stopReason,
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }
  return { fetch, seen }
}

const answer = JSON.stringify({
  title: 'T',
  clusters: [{ label: 'L', summary: 'S', refs: ['n1'] }],
  unassigned: [],
})

describe('askClaude', () => {
  it('asks the current Opus with structured output and server-side fallbacks', async () => {
    const { fetch, seen } = upstream('end_turn', answer)
    const ask = askClaude({ apiKey: 'k', baseURL: 'https://upstream.test', fetch })
    expect(await ask(request)).toEqual({ kind: 'answer', answer: JSON.parse(answer) })
    const call = seen[0]!
    expect(call.url).toBe('https://upstream.test/v1/messages?beta=true')
    expect(call.headers.get('x-api-key')).toBe('k')
    expect(call.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
    expect(call.body.model).toBe('claude-opus-5-5')
    expect(call.body.fallbacks).toBe('default')
    expect(call.body).not.toHaveProperty('thinking')
    expect((call.body.output_config as { effort: string }).effort).toBe('medium')
    expect(JSON.stringify(call.body.messages)).toContain('<note ref=\\"n1\\">a</note>')
  })

  it('treats a refusal as declined and a cut-off answer as failed, never parsing either', async () => {
    expect(await askClaude({ apiKey: 'k', fetch: upstream('refusal', '').fetch })(request)).toEqual(
      {
        kind: 'declined',
      },
    )
    expect(
      await askClaude({ apiKey: 'k', fetch: upstream('max_tokens', '{"title":').fetch })(request),
    ).toEqual({ kind: 'failed' })
  })

  it('says it failed when the provider does', async () => {
    const down: typeof globalThis.fetch = () =>
      Promise.resolve(new Response('{"type":"error"}', { status: 400 }))
    expect(await askClaude({ apiKey: 'k', fetch: down })(request)).toEqual({ kind: 'failed' })
  })
})
