import {
  ClusterRequestSchema,
  SummaryRequestSchema,
  validateClusterProposal,
  validateSummary,
  type ClusterProposal,
  type ClusterRequest,
  type Summary,
  type SummaryRequest,
} from '@openframe/core/ai'

/**
 * `POST /ai/cluster` and `POST /ai/summary`: themes for a set of notes, or a
 * summary of them, from Claude (ADR 0018, ADR 0022). One path for both, so a
 * second AI feature cannot loosen a check the first one held.
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

export interface AiDeps<Request> {
  /** False when the worker has no key or no way to check who is asking. */
  readonly configured: boolean
  readonly verify: (token: string) => Promise<Verified>
  /** One allowance a day for every AI feature together (ADR 0022). */
  readonly reserve: (userId: string) => Promise<Reserved>
  readonly refund: (userId: string, day: string) => Promise<void>
  readonly ask: (request: Request) => Promise<Asked>
}

export type ClusterDeps = AiDeps<ClusterRequest>
export type SummaryDeps = AiDeps<SummaryRequest>

/** What one AI feature brings to the shared path: its request, its check, and its words. */
interface AiFeature<Request, Result> {
  /** Its request's shape, as core defines it; only the parse is needed here. */
  readonly schema: {
    readonly safeParse: (
      value: unknown,
    ) => { readonly success: true; readonly data: Request } | { readonly success: false }
  }
  readonly validate: (
    answer: unknown,
    request: Request,
  ) =>
    { readonly ok: true; readonly value: Result } | { readonly ok: false; readonly reason: string }
  /** The key the result is answered under. */
  readonly field: string
  readonly tooMuch: string
  readonly notThis: string
  readonly declined: string
}

const CLUSTERING: AiFeature<ClusterRequest, ClusterProposal> = {
  schema: ClusterRequestSchema,
  validate: (answer, request) => {
    const checked = validateClusterProposal(answer, request)
    return checked.ok ? { ok: true, value: checked.proposal } : checked
  },
  field: 'proposal',
  tooMuch: 'Too much to cluster at once',
  notThis: 'That is not a request to cluster notes',
  declined: 'The AI declined to cluster these notes',
}

const SUMMARISING: AiFeature<SummaryRequest, Summary> = {
  schema: SummaryRequestSchema,
  validate: (answer, request) => {
    const checked = validateSummary(answer, request)
    return checked.ok ? { ok: true, value: checked.summary } : checked
  },
  field: 'summary',
  tooMuch: 'Too much to summarise at once',
  notThis: 'That is not a request to summarise notes',
  declined: 'The AI declined to summarise these notes',
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

export function handleCluster(request: Request, deps: ClusterDeps): Promise<Response> {
  return handleAi(request, deps, CLUSTERING)
}

export function handleSummary(request: Request, deps: SummaryDeps): Promise<Response> {
  return handleAi(request, deps, SUMMARISING)
}

async function handleAi<Req, Result>(
  request: Request,
  deps: AiDeps<Req>,
  feature: AiFeature<Req, Result>,
): Promise<Response> {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > MAX_BODY_BYTES) return refuse(413, 'too-large', feature.tooMuch)

  if (!deps.configured) return refuse(503, 'unconfigured', 'AI is not set up on this server')

  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]
  if (token === undefined) return refuse(401, 'signed-out', 'Sign in to use AI')

  // Read as text, so a body that lied about its length is still held to the limit.
  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return refuse(413, 'too-large', feature.tooMuch)
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return refuse(400, 'invalid', feature.notThis)
  }
  const parsed = feature.schema.safeParse(body)
  if (!parsed.success) return refuse(400, 'invalid', feature.notThis)

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
      ? refuse(422, 'declined', feature.declined)
      : refuse(502, 'failed', 'The AI did not finish')
  }
  const checked = feature.validate(asked.answer, parsed.data)
  if (!checked.ok) {
    await deps.refund(who.userId, slot.day)
    return refuse(422, 'invalid', checked.reason)
  }
  return json(200, { [feature.field]: checked.value, remaining: slot.remaining })
}

export interface ClusterSuccess {
  readonly proposal: ClusterProposal
  readonly remaining: number
}

export interface SummarySuccess {
  readonly summary: Summary
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
