import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  contentSecurityPolicy,
  inlineHandlers,
  inlineScripts,
  withPolicy,
} from './content-security-policy.js'

/**
 * The policy the built page carries.
 *
 * Whether a browser HONOURS it — every inline script still runs, every socket
 * still opens — is `e2e-rooms/content-security.spec.ts`, against a production
 * build and a real room. This is the arithmetic, and the page it is taken from.
 */

const HTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('base64')

function directive(policy: string, name: string): string[] {
  const found = policy
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([first]) => first === name)
  if (found === undefined) throw new Error(`no ${name} in ${policy}`)
  return found.slice(1)
}

const production = contentSecurityPolicy({
  html: HTML,
  supabaseUrl: 'https://project.supabase.co',
  collabUrl: 'wss://rooms.example.dev',
  sha256,
})

describe('the scripts the page runs before the application', () => {
  it('finds the schema mode, the splash, its label and the watchdog, and not the entry module', () => {
    const scripts = inlineScripts(HTML)
    expect(scripts).toHaveLength(4)
    expect(scripts.join('')).toContain('__zod_globalConfig')
    expect(scripts.join('')).toContain('splash-seen')
    expect(scripts.join('')).toContain('Opening the board')
    expect(scripts.join('')).toContain('Still opening')
    expect(scripts.join('')).not.toContain('main.tsx')
  })

  it('allows each of them by its hash, and nothing inline by default', () => {
    const scripts = directive(production, 'script-src')
    for (const body of inlineScripts(HTML)) expect(scripts).toContain(`'sha256-${sha256(body)}'`)
    expect(scripts).not.toContain("'unsafe-inline'")
    expect(scripts).not.toContain("'unsafe-eval'")
  })

  /**
   * The schema-mode script in `index.html` sets a global that zod reads, not
   * an API it exports, because it has to run before any module does. So the
   * name is held against the zod actually installed: an upgrade that moved it
   * would bring back a policy violation on every page load, and nothing else
   * would notice.
   */
  it('turns zod’s eval probe off through the global the installed zod reads', () => {
    const zodCore = readFileSync(
      resolve(process.cwd(), '../../packages/core/node_modules/zod/v4/core/core.js'),
      'utf8',
    )
    expect(zodCore).toMatch(/export const globalConfig = globalThis\.__zod_globalConfig;/)
    const util = readFileSync(
      resolve(process.cwd(), '../../packages/core/node_modules/zod/v4/core/util.js'),
      'utf8',
    )
    expect(util).toMatch(/allowsEval = [^]*?if \(globalConfig\.jitless\)/)
    expect(HTML).toMatch(/__zod_globalConfig[^]*?\.jitless = true/)
  })

  it('allows the splash artwork’s onload by its hash', () => {
    const handlers = inlineHandlers(HTML)
    expect(handlers).toEqual(["this.dataset.loaded = 'true'"])
    const scripts = directive(production, 'script-src')
    expect(scripts).toContain("'unsafe-hashes'")
    expect(scripts).toContain(`'sha256-${sha256("this.dataset.loaded = 'true'")}'`)
  })

  it('hashes a handler as the browser reads it, entities decoded', () => {
    expect(inlineHandlers(`<img onload="say(&quot;hi&quot;) &amp;&amp; go()">`)).toEqual([
      'say("hi") && go()',
    ])
    expect(() => inlineHandlers(`<img onload="go(&hellip;)">`)).toThrow(/entity/)
  })

  it('does not hash a script that is loaded from a file', () => {
    expect(
      inlineScripts('<script type="module" src="/a.js"></script><script>b()</script>'),
    ).toEqual(['b()'])
  })
})

describe('where the page may connect', () => {
  it('reaches the room server over both its schemes, and its images', () => {
    const connect = directive(production, 'connect-src')
    expect(connect).toContain('https://rooms.example.dev')
    expect(connect).toContain('wss://rooms.example.dev')
    expect(directive(production, 'img-src')).toContain('https://rooms.example.dev')
    expect(directive(production, 'img-src')).not.toContain('wss://rooms.example.dev')
  })

  /*
   * Session music plays from the room server (ADR 0017). With no `media-src`
   * the browser falls back to `default-src 'self'`, and every track is
   * blocked before a byte of it is fetched.
   */
  it('plays the room server’s music, and media from nowhere else', () => {
    expect(directive(production, 'media-src')).toEqual(["'self'", 'https://rooms.example.dev'])
  })

  it('reaches Supabase, and its socket for live comments', () => {
    const connect = directive(production, 'connect-src')
    expect(connect).toContain('https://project.supabase.co')
    expect(connect).toContain('wss://project.supabase.co')
  })

  it('keeps a local room server on plain schemes, as the rooms suite runs it', () => {
    const local = contentSecurityPolicy({
      html: HTML,
      supabaseUrl: null,
      collabUrl: 'ws://127.0.0.1:8787/',
      sha256,
    })
    expect(directive(local, 'connect-src')).toEqual([
      "'self'",
      'http://127.0.0.1:8787',
      'ws://127.0.0.1:8787',
    ])
  })

  it('reaches nothing else in a build with no servers', () => {
    const alone = contentSecurityPolicy({ html: HTML, supabaseUrl: null, collabUrl: null, sha256 })
    expect(directive(alone, 'connect-src')).toEqual(["'self'"])
    expect(directive(alone, 'img-src')).toEqual(["'self'", 'data:', 'blob:'])
    expect(directive(alone, 'media-src')).toEqual(["'self'"])
  })

  it('shuts the doors nothing here uses', () => {
    expect(directive(production, 'object-src')).toEqual(["'none'"])
    expect(directive(production, 'base-uri')).toEqual(["'none'"])
    expect(directive(production, 'default-src')).toEqual(["'self'"])
  })

  it('leaves framing to the header, where a browser reads it', () => {
    // A <meta> policy's frame-ancestors is ignored, so one here would read as
    // protection and be none. `deploy-config.test.ts` holds the header.
    expect(production).not.toContain('frame-ancestors')
  })
})

describe('the page it is written into', () => {
  it('comes before every script, or the first ones run unchecked', () => {
    const page = withPolicy(HTML, production)
    const meta = page.indexOf('http-equiv="Content-Security-Policy"')
    expect(meta).toBeGreaterThan(-1)
    expect(meta).toBeLessThan(page.indexOf('<script'))
  })

  it('is refused by a page with nowhere to put it', () => {
    expect(() => withPolicy('<html><head></head></html>', production)).toThrow(/charset/)
  })
})
