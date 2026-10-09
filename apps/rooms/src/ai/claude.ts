import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import {
  CLUSTER_SYSTEM_PROMPT,
  ClusterAnswerSchema,
  clusterPrompt,
  SUMMARY_SYSTEM_PROMPT,
  SummaryAnswerSchema,
  summaryPrompt,
  type ClusterRequest,
  type SummaryRequest,
} from '@openframe/core/ai'

import type { Asked } from './handler.js'

export const DEFAULT_MODEL = 'claude-opus-5-5'
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
type Effort = (typeof EFFORTS)[number]

export const effortOf = (value: string | undefined): Effort =>
  (EFFORTS as readonly string[]).includes(value ?? '') ? (value as Effort) : 'medium'

interface Options {
  readonly apiKey: string
  readonly model?: string
  readonly effort?: string
  readonly baseURL?: string
  readonly fetch?: typeof globalThis.fetch
}

/** What one AI feature asks: its instructions, its words, and the answer's shape. */
interface Task<Request> {
  readonly name: string
  readonly system: string
  readonly prompt: (request: Request) => string
  readonly answer: typeof ClusterAnswerSchema | typeof SummaryAnswerSchema
  /** Room for the answer: a cluster names every note; a summary is a few sentences. */
  readonly maxTokens: number
}

/** Themes for a set of notes (ADR 0018). */
export function askClaude(options: Options): (request: ClusterRequest) => Promise<Asked> {
  return askFor(options, {
    name: 'cluster',
    system: CLUSTER_SYSTEM_PROMPT,
    prompt: clusterPrompt,
    answer: ClusterAnswerSchema,
    maxTokens: 16_000,
  })
}

/** A summary of a set of notes (ADR 0022). */
export function askClaudeToSummarise(
  options: Options,
): (request: SummaryRequest) => Promise<Asked> {
  return askFor(options, {
    name: 'summary',
    system: SUMMARY_SYSTEM_PROMPT,
    prompt: summaryPrompt,
    answer: SummaryAnswerSchema,
    maxTokens: 4_000,
  })
}

/**
 * One call to Claude for one set of notes, with the answer held to a schema by
 * the API itself (structured output) and checked again by the validator
 * afterwards. The key lives here, in the worker, and nowhere a browser can
 * reach (ADR 0018).
 *
 * - `fallbacks: 'default'`: a request one model declines is retried on the
 *   model Anthropic recommends for that kind of decline, inside the same call.
 * - The stop reason is read before anything else: a refusal or an answer cut
 *   off at `max_tokens` is never parsed as if it were a proposal.
 */
function askFor<Request>(
  options: Options,
  task: Task<Request>,
): (request: Request) => Promise<Asked> {
  const client = new Anthropic({
    apiKey: options.apiKey,
    ...(options.baseURL === undefined || options.baseURL === ''
      ? {}
      : { baseURL: options.baseURL }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    // A person is waiting on this; a minute is long enough for 200 notes.
    timeout: 60_000,
    maxRetries: 1,
  })
  const model = options.model === undefined || options.model === '' ? DEFAULT_MODEL : options.model
  const effort = effortOf(options.effort)

  const format = betaZodOutputFormat(task.answer)

  return async (request) => {
    try {
      // `create`, not `parse`: the parse helper reads the text before the stop
      // reason can be, so a refusal with no JSON in it came back as a crash.
      const response = await client.beta.messages.create({
        model,
        max_tokens: task.maxTokens,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: task.system,
        output_config: { effort, format },
        messages: [{ role: 'user', content: task.prompt(request) }],
      })
      if (response.stop_reason === 'refusal') return { kind: 'declined' }
      if (response.stop_reason !== 'end_turn') return { kind: 'failed' }
      const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : []))
      const answer = task.answer.safeParse(JSON.parse(text.join('')))
      return answer.success ? { kind: 'answer', answer: answer.data } : { kind: 'failed' }
    } catch (error) {
      // An outage, a rate limit after the retry, a timeout: the person is told
      // it did not finish, and the worker's log says why.
      console.error(
        `[ai] ${task.name} failed`,
        error instanceof Anthropic.APIError ? error.status : error,
      )
      return { kind: 'failed' }
    }
  }
}
