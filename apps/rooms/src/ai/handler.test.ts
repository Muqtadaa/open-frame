import { describe, expect, it, vi } from 'vitest'

import {
  handleCluster,
  type Asked,
  type ClusterDeps,
  type Reserved,
  type Verified,
} from './handler.js'

const notes = [
  { ref: 'n1', text: 'Price is hidden' },
  { ref: 'n2', text: 'Shipping cost surprises' },
  { ref: 'n3', text: 'Returns are hard' },
]
const goodAnswer = {
  title: 'Checkout',
  clusters: [{ label: 'Cost', summary: 'Money.', refs: ['n1', 'n2'] }],
  unassigned: [],
}

function deps(overrides: Partial<ClusterDeps> = {}) {
  return {
    configured: true,
    verify: vi.fn<(token: string) => Promise<Verified>>(() => Promise.resolve({ userId: 'u1' })),
    reserve: vi.fn<(id: string) => Promise<Reserved>>(() =>
      Promise.resolve({ ok: true, remaining: 19 }),
    ),
    refund: vi.fn<(id: string) => Promise<void>>(() => Promise.resolve()),
    ask: vi.fn<ClusterDeps['ask']>(() =>
      Promise.resolve<Asked>({ kind: 'answer', answer: goodAnswer }),
    ),
    ...overrides,
  }
}

const post = (body: unknown, headers: Record<string, string> = { authorization: 'Bearer t' }) =>
  new Request('https://rooms.example/ai/cluster', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

const outcome = async (response: Response) => (await response.json<{ outcome?: string }>()).outcome

describe('POST /ai/cluster', () => {
  it('answers a proposal held to the notes sent, and how many runs are left', async () => {
    const d = deps()
    const response = await handleCluster(post({ notes }), d)
    expect(response.status).toBe(200)
    const body = await response.json<{ proposal: { unassigned: string[] }; remaining: number }>()
    expect(body.proposal.unassigned).toEqual(['n3'])
    expect(body.remaining).toBe(19)
    expect(d.ask).toHaveBeenCalledWith({ notes })
  })

  it('never reaches the model without a bearer, with a bad body, or for somebody signed out', async () => {
    for (const [request, status, why] of [
      [post({ notes }, {}), 401, 'signed-out'],
      [post('not json'), 400, 'invalid'],
      [post({ notes: notes.slice(0, 2) }), 400, 'invalid'],
      [post({ notes, extra: 1 }), 400, 'invalid'],
    ] as const) {
      const d = deps()
      const response = await handleCluster(request, d)
      expect([response.status, await outcome(response)]).toEqual([status, why])
      expect(d.ask).not.toHaveBeenCalled()
      expect(d.reserve).not.toHaveBeenCalled()
    }
    const refused = deps({ verify: () => Promise.resolve('refused') })
    const response = await handleCluster(post({ notes }), refused)
    expect(response.status).toBe(401)
    expect(refused.ask).not.toHaveBeenCalled()
  })

  it('refuses a body too large before reading it, and one that lied about its size after', async () => {
    const d = deps()
    const big = await handleCluster(
      new Request('https://rooms.example/ai/cluster', {
        method: 'POST',
        headers: { authorization: 'Bearer t', 'content-length': String(200 * 1024) },
        body: '{}',
      }),
      d,
    )
    expect(big.status).toBe(413)
    const sneaky = await handleCluster(post('x'.repeat(130 * 1024)), d)
    expect(sneaky.status).toBe(413)
    expect(d.verify).not.toHaveBeenCalled()
  })

  it('says AI is not set up, rather than failing, until the worker has a key', async () => {
    const d = deps({ configured: false })
    const response = await handleCluster(post({ notes }), d)
    expect([response.status, await outcome(response)]).toEqual([503, 'unconfigured'])
    expect(d.verify).not.toHaveBeenCalled()
  })

  it('stops at the daily limit, before the model', async () => {
    const d = deps({ reserve: () => Promise.resolve({ ok: false, limit: 'person' }) })
    const response = await handleCluster(post({ notes }), d)
    expect([response.status, await outcome(response)]).toEqual([429, 'limit'])
    expect(d.ask).not.toHaveBeenCalled()
  })

  it('gives the run back when the model declines, fails, or answers about notes it was not sent', async () => {
    for (const [asked, status, why] of [
      [{ kind: 'declined' }, 422, 'declined'],
      [{ kind: 'failed' }, 502, 'failed'],
      [
        {
          kind: 'answer',
          answer: { ...goodAnswer, clusters: [{ label: 'X', summary: '', refs: ['n9'] }] },
        },
        422,
        'invalid',
      ],
    ] as const) {
      const d = deps({ ask: () => Promise.resolve(asked as Asked) })
      const response = await handleCluster(post({ notes }), d)
      expect([response.status, await outcome(response)]).toEqual([status, why])
      expect(d.refund).toHaveBeenCalledWith('u1')
    }
  })

  it('checks who is asking before it takes a run', async () => {
    const order: string[] = []
    const d = deps({
      verify: () => {
        order.push('verify')
        return Promise.resolve({ userId: 'u1' })
      },
      reserve: () => {
        order.push('reserve')
        return Promise.resolve({ ok: true, remaining: 1 })
      },
      ask: () => {
        order.push('ask')
        return Promise.resolve({ kind: 'answer', answer: goodAnswer })
      },
    })
    await handleCluster(post({ notes }), d)
    expect(order).toEqual(['verify', 'reserve', 'ask'])
  })
})
