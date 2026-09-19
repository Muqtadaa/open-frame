import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The committed `.env` holds public configuration, and this is what keeps it
 * that way.
 *
 * A committed env file is exactly where somebody eventually pastes a real
 * secret — it is the obvious place to put "the other key", and nothing about
 * the file itself says which kind it holds. Vite inlines every `VITE_` value
 * into the bundle, so a secret here is not leaked later; it is published on the
 * next deploy.
 */
const ENV = readFileSync(resolve(process.cwd(), '.env'), 'utf8')

const entries = ENV.split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'))
  .map((line) => {
    const at = line.indexOf('=')
    return { key: line.slice(0, at), value: line.slice(at + 1) }
  })

/** Everything this build is allowed to configure publicly. */
const ALLOWED = new Set([
  'VITE_COLLAB_URL',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
])

/**
 * Shapes that are never publishable.
 *
 * A Supabase service-role key is a JWT whose payload decodes to
 * `"role":"service_role"`, and the modern secret format is `sb_secret_`. A
 * Cloudflare API token has no distinctive prefix, so the `VITE_` check below
 * does most of the work: nothing sensitive belongs in a bundled variable
 * whatever it is called.
 */
const SECRET_SHAPES: readonly (readonly [string, RegExp])[] = [
  ['a Supabase secret key', /\bsb_secret_/],
  ['a service-role JWT', /service_role/],
  ['a private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
]

describe('the committed environment file', () => {
  it('has at least the configuration this build needs', () => {
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.map((entry) => entry.key).sort()).toEqual([...ALLOWED].sort())
  })

  /**
   * Anything not prefixed `VITE_` is invisible to the bundle anyway, so its
   * presence here means somebody believed this file was a place for server
   * configuration. It is not.
   */
  it('holds only variables that are meant to be public', () => {
    for (const { key } of entries) {
      expect(key, `${key} is not a VITE_ variable and does not belong here`).toMatch(/^VITE_/)
      expect(ALLOWED, `${key} was added without being declared in this test`).toContain(key)
    }
  })

  it.each(SECRET_SHAPES)('contains nothing shaped like %s', (_label, pattern) => {
    expect(ENV).not.toMatch(pattern)
  })

  /** A JWT here is only ever the legacy anon key; a service-role one is not. */
  it('carries no service-role token, however it is spelled', () => {
    for (const { value } of entries) {
      const payload = /^ey[\w-]+\.([\w-]+)\./.exec(value)?.[1]
      if (payload === undefined) continue
      const decoded = Buffer.from(payload, 'base64url').toString('utf8')
      expect(decoded, 'a service-role key is in the committed env file').not.toContain(
        'service_role',
      )
    }
  })
})
