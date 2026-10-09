import {
  ClusterRequestSchema,
  SummaryRequestSchema,
  validateClusterProposal,
  validateSummary,
  type ClusterRequest,
  type SummaryRequest,
} from '@openframe/core/ai'

import type { AiRefusal, AiService } from '../../runtime/services.js'

export interface AiClientOptions {
  /** The room server's http(s) base, no trailing slash. */
  readonly base: string
  readonly fetch: typeof globalThis.fetch
}

const REFUSALS: readonly AiRefusal[] = [
  'signed-out',
  'unconfigured',
  'too-large',
  'invalid',
  'unreachable',
  'limit',
  'declined',
  'failed',
]

const refused = (why: AiRefusal) => ({ kind: 'refused', why }) as const

type Posted = { readonly kind: 'answered'; readonly body: unknown } | ReturnType<typeof refused>

/**
 * The room server's `/ai/*` routes (ADR 0018, ADR 0022). The key to the model
 * is the server's; what goes from here is the notes' text and who is asking.
 *
 * Each answer is checked again on arrival (rule 8): the server is ours, but
 * the answer is still somebody else's output about OUR notes, and it is about
 * to become objects on a board.
 */
export function createAiClient(options: AiClientOptions): AiService {
  const post = async (
    path: string,
    request: unknown,
    accessToken: string,
    signal: AbortSignal | undefined,
  ): Promise<Posted> => {
    let response: Response
    try {
      response = await options.fetch(`${options.base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(request),
        ...(signal === undefined ? {} : { signal }),
      })
    } catch (error) {
      if (signal?.aborted === true) throw error
      return refused('unreachable')
    }
    let body: unknown
    try {
      body = await response.json()
    } catch {
      return refused(response.ok ? 'failed' : 'unreachable')
    }
    if (!response.ok) {
      const outcome = (body as { outcome?: unknown } | null)?.outcome
      return refused(REFUSALS.includes(outcome as AiRefusal) ? (outcome as AiRefusal) : 'failed')
    }
    return { kind: 'answered', body }
  }

  const remainingOf = (body: unknown): number => {
    const remaining = (body as { remaining?: unknown } | null)?.remaining
    return typeof remaining === 'number' && remaining >= 0 ? Math.floor(remaining) : 0
  }

  return {
    enabled: true,
    cluster: async (request: ClusterRequest, accessToken, signal) => {
      // Refused here rather than sent: the server would refuse it the same way.
      if (!ClusterRequestSchema.safeParse(request).success) return refused('too-large')
      const posted = await post('/ai/cluster', request, accessToken, signal)
      if (posted.kind === 'refused') return posted
      const proposal = (posted.body as { proposal?: unknown } | null)?.proposal
      const checked = validateClusterProposal(proposal, request)
      if (!checked.ok) return refused('invalid')
      return { kind: 'proposal', proposal: checked.proposal, remaining: remainingOf(posted.body) }
    },
    summarise: async (request: SummaryRequest, accessToken, signal) => {
      if (!SummaryRequestSchema.safeParse(request).success) return refused('too-large')
      const posted = await post('/ai/summary', request, accessToken, signal)
      if (posted.kind === 'refused') return posted
      const summary = (posted.body as { summary?: unknown } | null)?.summary
      const checked = validateSummary(summary, request)
      if (!checked.ok) return refused('invalid')
      return { kind: 'summary', summary: checked.summary, remaining: remainingOf(posted.body) }
    },
  }
}
