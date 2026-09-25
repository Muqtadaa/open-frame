import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ROOM_SERVER, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './project.js'

/**
 * The copy, held to the original.
 *
 * `apps/mcp` may not import from `apps/web`, so the build's public
 * configuration is written out twice — and a second transcription of an
 * address is a second thing to update when it changes. This reads the web
 * app's committed `.env` and compares, which is the only thing that makes the
 * copy safe.
 *
 * A path rather than an import, deliberately: the rule that keeps these two
 * apart is about code, and a test reading a file is not code depending on
 * code. If `apps/mcp` is ever published on its own, this is the test that
 * notices.
 */
const ENV = readFileSync(resolve(import.meta.dirname, '../../web/.env'), 'utf8')

function configured(key: string): string {
  const line = ENV.split('\n').find((candidate) => candidate.startsWith(`${key}=`))
  expect(line, `${key} is not in the web app's .env`).toBeDefined()
  return (line ?? '').slice(key.length + 1).trim()
}

describe('the project this server belongs to', () => {
  it('is the one the browser build signs into', () => {
    expect(SUPABASE_URL).toBe(configured('VITE_SUPABASE_URL'))
    expect(SUPABASE_PUBLISHABLE_KEY).toBe(configured('VITE_SUPABASE_PUBLISHABLE_KEY'))
  })

  it('joins the rooms the browser build joins', () => {
    expect(ROOM_SERVER).toBe(configured('VITE_COLLAB_URL'))
  })

  /**
   * The same guard the web app's env file carries, for the same reason: this
   * is now a second obvious place to paste "the other key", and nothing about
   * a constant called `SUPABASE_…` says which kind it holds.
   */
  it('holds nothing that is not publishable', () => {
    const shapes: readonly (readonly [string, RegExp])[] = [
      ['a Supabase secret key', /\bsb_secret_/],
      ['a service-role JWT', /service_role/],
      ['a private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ]
    const source = readFileSync(resolve(import.meta.dirname, 'project.ts'), 'utf8')
    for (const [what, shape] of shapes) {
      expect(shape.test(source), `project.ts looks like it holds ${what}`).toBe(false)
    }
    expect(SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')).toBe(true)
  })
})
