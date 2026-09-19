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
