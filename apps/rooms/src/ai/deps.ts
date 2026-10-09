import type { Env } from '../env.js'
import { askClaude, askClaudeToSummarise } from './claude.js'
import type { AiDeps, ClusterDeps, SummaryDeps } from './handler.js'
import { verifyWithSupabase } from './supabase.js'

const limit = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

type Ask<Request> = AiDeps<Request>['ask']
type Asker<Request> = (options: Parameters<typeof askClaude>[0]) => Ask<Request>

/**
 * The real dependencies, from the worker's bindings, secret and variables.
 *
 * Every feature reserves against the SAME quota object with the same limits, so
 * a person has one daily allowance of AI runs whatever they spend it on
 * (ADR 0022). A quota per feature would quietly double what the owner agreed to
 * pay for each time a feature was added.
 */
function aiDeps<Request>(env: Env, asker: Asker<Request>): AiDeps<Request> {
  const key = env.ANTHROPIC_API_KEY ?? ''
  const url = env.SUPABASE_URL ?? ''
  const publishable = env.SUPABASE_PUBLISHABLE_KEY ?? ''
  const limits = {
    person: limit(env.AI_DAILY_LIMIT, 20),
    everyone: limit(env.AI_GLOBAL_DAILY_LIMIT, 1000),
  }
  const quota = () => env.AI_QUOTA.get(env.AI_QUOTA.idFromName('quota'))
  const fetcher: typeof globalThis.fetch = (input, init) => fetch(input, init)
  return {
    configured: key !== '' && url !== '' && publishable !== '',
    verify: verifyWithSupabase({ url, publishableKey: publishable, fetch: fetcher }),
    reserve: (userId) => quota().reserve(userId, limits),
    refund: (userId, day) => quota().refund(userId, day),
    ask: asker({
      apiKey: key,
      ...(env.AI_MODEL === undefined ? {} : { model: env.AI_MODEL }),
      ...(env.AI_EFFORT === undefined ? {} : { effort: env.AI_EFFORT }),
      ...(env.AI_UPSTREAM_URL === undefined ? {} : { baseURL: env.AI_UPSTREAM_URL }),
      fetch: fetcher,
    }),
  }
}

export const clusterDeps = (env: Env): ClusterDeps => aiDeps(env, askClaude)
export const summaryDeps = (env: Env): SummaryDeps => aiDeps(env, askClaudeToSummarise)
