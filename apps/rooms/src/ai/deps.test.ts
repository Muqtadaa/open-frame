import { describe, expect, it } from 'vitest'

import type { Env } from '../env.js'
import { clusterDeps, summaryDeps } from './deps.js'

/** An env whose quota object records who reserved what, against which object. */
function env() {
  const reserved: { object: string; userId: string; limits: unknown }[] = []
  const namespace = {
    idFromName: (name: string) => name,
    get: (object: string) => ({
      reserve: (userId: string, limits: unknown) => {
        reserved.push({ object, userId, limits })
        return Promise.resolve({ ok: true, remaining: 1, day: 'd' })
      },
      refund: () => Promise.resolve(),
    }),
  }
  return {
    reserved,
    env: {
      AI_QUOTA: namespace,
      ANTHROPIC_API_KEY: 'k',
      SUPABASE_URL: 'https://s.test',
      SUPABASE_PUBLISHABLE_KEY: 'p',
      AI_DAILY_LIMIT: '7',
    } as unknown as Env,
  }
}

describe('the AI dependencies', () => {
  it('spend one daily allowance between clustering and summarising (ADR 0022)', async () => {
    const { env: e, reserved } = env()
    await clusterDeps(e).reserve('u1')
    await summaryDeps(e).reserve('u1')
    expect(reserved).toHaveLength(2)
    expect(reserved[0]).toEqual(reserved[1])
    expect(reserved[0]?.limits).toEqual({ person: 7, everyone: 1000 })
  })

  it('are configured by the same key and project', () => {
    const { env: e } = env()
    expect(summaryDeps(e).configured).toBe(true)
    expect(summaryDeps({ ...e, ANTHROPIC_API_KEY: '' }).configured).toBe(false)
  })
})
