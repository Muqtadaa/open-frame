import {
  ClusterRequestSchema,
  validateClusterProposal,
  type ClusterProposal,
  type ClusterRequest,
} from '@openframe/core/ai'

/**
 * `POST /ai/cluster`: themes for a set of notes, from Claude.
 *
 * The route never reads a room or its document (ADR 0018). It sees only the
 * note text the browser sends, answers with a proposal, and the browser
 * applies it through its own dispatcher — so the room keeps trusting nothing
 * it did not already trust, and ADR 0016's "server-side AI" trigger does not
 * fire.
 *
 * The order of the checks is the point: everything that costs nothing — size,
 * configuration, a bearer at all, the shape of the body — comes before the one
 * check that costs a round trip, and all of them come before the one that
 * costs money. A request that fails any of them never reaches the model.
 */

/** Far above what 200 notes of 600 characters come to as JSON, and far below anything abusive. */
export const MAX_BODY_BYTES = 128 * 1024

export type Verified = { readonly userId: string } | 'refused' | 'unreachable'

export type Reserved =
  /** `day` is the UTC day the run was taken from, and the only one a refund may give it back to. */
  | { readonly ok: true; readonly remaining: number; readonly day: string }
  | { readonly ok: false; readonly limit: 'person' | 'everyone' }

export type Asked =
  | { readonly kind: 'answer'; readonly answer: unknown }
  /** The model, and every fallback, declined. */
  | { readonly kind: 'declined' }
  /** It ran out of room before it finished, or the provider failed. */
  | { readonly kind: 'failed' }

export interface ClusterDeps {
  /** False when the worker has no key or no way to check who is asking. */
  readonly configured: boolean
  readonly verify: (token: string) => Promise<Verified>
  readonly reserve: (userId: string) => Promise<Reserved>
  readonly refund: (userId: string, day: string) => Promise<void>
  readonly ask: (request: ClusterRequest) => Promise<Asked>
}

export type ClusterOutcome =
  | 'too-large'
  | 'unconfigured'
  | 'signed-out'
  | 'invalid'
  | 'unreachable'
  | 'limit'
  | 'declined'
  | 'failed'

export async function handleCluster(request: Request, deps: ClusterDeps): Promise<Response> {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > MAX_BODY_BYTES) return refuse(413, 'too-large', 'Too much to cluster at once')

  if (!deps.configured) return refuse(503, 'unconfigured', 'AI is not set up on this server')

  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]
  if (token === undefined) return refuse(401, 'signed-out', 'Sign in to use AI')

  // Read as text, so a body that lied about its length is still held to the limit.
  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return refuse(413, 'too-large', 'Too much to cluster at once')
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return refuse(400, 'invalid', 'That is not a request to cluster notes')
  }
  const parsed = ClusterRequestSchema.safeParse(body)
  if (!parsed.success) return refuse(400, 'invalid', 'That is not a request to cluster notes')

  const who = await deps.verify(token)
  if (who === 'refused') return refuse(401, 'signed-out', 'Sign in to use AI')
  if (who === 'unreachable') return refuse(503, 'unreachable', 'Could not check who you are')

  const slot = await deps.reserve(who.userId)
  if (!slot.ok) {
    return refuse(
      429,
      'limit',
      slot.limit === 'person' ? 'No AI runs left today' : 'AI is busy for today',
    )
  }

  /*
   * Anything that is not an answer the board can use gives the run back: a
   * person should not lose one of their twenty to a refusal, an outage or an
   * answer the validator would not accept.
   */
  const asked = await deps.ask(parsed.data)
  if (asked.kind !== 'answer') {
    await deps.refund(who.userId, slot.day)
    return asked.kind === 'declined'
      ? refuse(422, 'declined', 'The AI declined to cluster these notes')
      : refuse(502, 'failed', 'The AI did not finish')
  }
  const checked = validateClusterProposal(asked.answer, parsed.data)
  if (!checked.ok) {
    await deps.refund(who.userId, slot.day)
    return refuse(422, 'invalid', checked.reason)
  }
  return json(200, { proposal: checked.proposal, remaining: slot.remaining })
}

export interface ClusterSuccess {
  readonly proposal: ClusterProposal
  readonly remaining: number
}

function refuse(status: number, outcome: ClusterOutcome, message: string): Response {
  return json(status, { outcome, message })
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    },
  })
}
