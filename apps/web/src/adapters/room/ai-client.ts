import {
  ClusterRequestSchema,
  validateClusterProposal,
  type ClusterRequest,
} from '@openframe/core/ai'

import type { AiService, ClusterOutcome, ClusterRefusal } from '../../runtime/services.js'

export interface AiClientOptions {
  /** The room server's http(s) base, no trailing slash. */
  readonly base: string
  readonly fetch: typeof globalThis.fetch
}

const REFUSALS: readonly ClusterRefusal[] = [
  'signed-out',
  'unconfigured',
  'too-large',
  'invalid',
  'unreachable',
  'limit',
  'declined',
  'failed',
]

const refused = (why: ClusterRefusal): ClusterOutcome => ({ kind: 'refused', why })

/**
 * The room server's `/ai/cluster` (ADR 0018). The key to the model is the
 * server's; what goes from here is the notes' text and who is asking.
 *
 * The answer is checked again on arrival (rule 8): the server is ours, but the
 * proposal is still somebody else's output about OUR notes, and it is about to
 * become objects on a board.
 */
export function createAiClient(options: AiClientOptions): AiService {
  return {
    enabled: true,
    cluster: async (request: ClusterRequest, accessToken, signal) => {
      // Refused here rather than sent: the server would refuse it the same way.
      if (!ClusterRequestSchema.safeParse(request).success) return refused('too-large')
      let response: Response
      try {
        response = await options.fetch(`${options.base}/ai/cluster`, {
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
        return refused(
          REFUSALS.includes(outcome as ClusterRefusal) ? (outcome as ClusterRefusal) : 'failed',
        )
      }
      const { proposal, remaining } = (body ?? {}) as { proposal?: unknown; remaining?: unknown }
      const checked = validateClusterProposal(proposal, request)
      if (!checked.ok) return refused('invalid')
      return {
        kind: 'proposal',
        proposal: checked.proposal,
        remaining: typeof remaining === 'number' && remaining >= 0 ? Math.floor(remaining) : 0,
      }
    },
  }
}
