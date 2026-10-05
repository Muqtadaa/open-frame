import type { Env } from '../env.js'
import { askClaude } from './claude.js'
import type { ClusterDeps } from './handler.js'
import { verifyWithSupabase } from './supabase.js'

const limit = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

/** The real dependencies, from the worker's bindings, secret and variables. */
export function clusterDeps(env: Env): ClusterDeps {
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
    refund: (userId) => quota().refund(userId),
    ask: askClaude({
      apiKey: key,
      ...(env.AI_MODEL === undefined ? {} : { model: env.AI_MODEL }),
      ...(env.AI_EFFORT === undefined ? {} : { effort: env.AI_EFFORT }),
      ...(env.AI_UPSTREAM_URL === undefined ? {} : { baseURL: env.AI_UPSTREAM_URL }),
      fetch: fetcher,
    }),
  }
}
