import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * What the web deployment installs and builds.
 *
 * This is the second time a build passed locally and failed on Vercel, so it
 * gets a test rather than a memory. The failure mode both times was the same
 * shape: something true of the repository that is not true of the deployment.
 *
 * The rule is narrow and worth stating — **the web deployment builds the web
 * app.** Adding a workspace package used to change what every deploy installed:
 * `apps/rooms` brought `wrangler` and `workerd`, hundreds of megabytes of a
 * server runtime, into an install whose only job is a static bundle. Filtering
 * takes it from 400-odd packages to 279 and removes an entire class of failure
 * that has nothing to do with the site.
 */
const CONFIG = JSON.parse(readFileSync(resolve(process.cwd(), '../../vercel.json'), 'utf8')) as {
  installCommand?: string
  buildCommand?: string
  outputDirectory?: string
}

const install = CONFIG.installCommand ?? ''
const build = CONFIG.buildCommand ?? ''

describe('the deployment config', () => {
  it('installs only what the web app needs', () => {
    expect(install).toContain('--frozen-lockfile')
    // `...` is the part that matters: the package AND its workspace
    // dependencies, so @openframe/core and @openframe/collab come too.
    expect(install).toContain('--filter @openframe/web...')
  })

  it('does not build the room server', () => {
    // `pnpm -r build` would: it walks every workspace package, including the
    // Durable Object, whose build needs a runtime this deployment never runs.
    expect(build).not.toMatch(/pnpm\s+(-r|--recursive)\s+build/)
    expect(build).toContain('--filter @openframe/web build')
  })

  /**
   * Rule 11: the guard that decides whether a deployment carries 4.7MB of
   * benchmark boards is manual, and the shape of it must stay visible here.
   */
  it('still chooses the bench build by environment variable', () => {
    expect(build).toContain('OPENFRAME_BENCH')
    expect(build).toContain('pnpm build:bench')
  })

  it('publishes the web app’s output', () => {
    expect(CONFIG.outputDirectory).toBe('apps/web/dist')
  })
})

/**
 * The two halves of `resolve.dedupe`, which only work together.
 *
 * `@supabase/*` is compiled with `importHelpers`, so its modules import
 * `tslib`. Nothing in this repository writes that import, and whether it
 * resolves depends on how the HOST laid out `node_modules` — pnpm links it
 * into each dependent's private directory here, and Vercel's install did not
 * have those links, so a build that was green locally failed there on a module
 * we never wrote.
 *
 * Deduping resolves it from the project root instead, which works only while
 * `tslib` is a declared dependency of this package. Delete either half and the
 * build breaks on a host whose layout differs from this one — which is to say,
 * not here, which is exactly why it needs a test.
 */
const VITE_CONFIG = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')
const PACKAGE = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>
}

function dedupedPackages(): readonly string[] {
  const list = /const DEDUPE = \[([^\]]*)\]/.exec(VITE_CONFIG)?.[1] ?? ''
  return [...list.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '')
}

describe('the packages the bundle resolves from the root', () => {
  it('still dedupes tslib', () => {
    // Named rather than merely non-empty: this is the one that actually broke a
    // deployment, and a future entry must not be able to satisfy the test for it.
    expect(dedupedPackages()).toContain('tslib')
  })

  it('declares every one of them as a dependency', () => {
    const declared = Object.keys(PACKAGE.dependencies ?? {})
    for (const name of dedupedPackages()) {
      expect(declared).toContain(name)
    }
  })
})
