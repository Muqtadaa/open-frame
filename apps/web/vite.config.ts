import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

import { contentSecurityPolicy, withPolicy } from './src/app/content-security-policy.js'

const FIXTURE_DIR = fileURLToPath(new URL('../../tools/bench/fixtures', import.meta.url))

/**
 * Benchmark boards are large (4.7MB for the full set) and exist only to answer
 * the renderer question. They must never reach a production bundle, so they
 * live outside `public/` — which Vite copies wholesale into every build — and
 * are surfaced explicitly instead:
 *
 *   dev            served from disk at /bench/*
 *   benchmark build  copied into the bundle
 *   production build not present at all
 */
function benchFixtures(enabled: boolean): Plugin {
  return {
    name: 'openframe-bench-fixtures',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/bench/')) {
          next()
          return
        }
        const requested = url.slice('/bench/'.length).replace(/\?.*$/, '')
        const file = resolve(FIXTURE_DIR, requested)
        // Containment check: the path is attacker-controlled in principle, and
        // a dev server that will read any file on disk is a real hazard.
        if (!file.startsWith(FIXTURE_DIR) || !existsSync(file)) {
          res.statusCode = 404
          res.end('No such benchmark fixture. Run: pnpm bench:fixtures')
          return
        }
        res.setHeader('content-type', 'application/json')
        createReadStream(file).pipe(res)
      })
    },

    generateBundle() {
      if (!enabled) return
      if (!existsSync(FIXTURE_DIR)) {
        this.warn('Benchmark build requested but no fixtures found. Run: pnpm bench:fixtures')
        return
      }
      for (const name of readdirSync(FIXTURE_DIR)) {
        if (!name.endsWith('.json')) continue
        this.emitFile({
          type: 'asset',
          fileName: `bench/${name}`,
          source: readFileSync(join(FIXTURE_DIR, name)),
        })
      }
    },
  }
}

/**
 * Packages a dependency imports that we resolve from the root instead.
 *
 * `@supabase/*` is compiled with `importHelpers`, so every one of its modules
 * imports `tslib` — a package this repository never mentions. Whether that
 * import resolves is a property of the INSTALLER, not of the code: pnpm links
 * it into each dependent's private `node_modules`, and a build that walks up
 * from the importer finds it there. Vercel's `node_modules` did not have those
 * links, and the build failed on an import no source file of ours writes.
 *
 * Deduping moves the lookup to the project root, where `tslib` is a declared
 * dependency of this package and therefore present however the host installs.
 * Both halves are load-bearing and were checked one at a time: with the
 * dependency but no dedupe the build fails, and with the dedupe but no
 * dependency it fails identically. `deploy-config.test.ts` keeps them together.
 */
const DEDUPE = ['tslib']

/**
 * The Content Security Policy, written into the built page.
 *
 * Build only: the dev server injects its own inline scripts for hot reload,
 * and a policy that blocked those would be switched off by the first person
 * it got in the way of. What it permits is explained beside the policy.
 */
function securityPolicy(): Plugin {
  let env: Record<string, string> = {}
  return {
    name: 'openframe-content-security-policy',
    apply: 'build',
    configResolved(config) {
      env = config.env as Record<string, string>
    },
    transformIndexHtml: {
      // After Vite has finished with the page, so the hashes are of what ships.
      order: 'post',
      handler(html) {
        const configured = (name: string) => {
          const value = env[name]
          return typeof value === 'string' && value.length > 0 ? value : null
        }
        const policy = contentSecurityPolicy({
          html,
          supabaseUrl: configured('VITE_SUPABASE_URL'),
          collabUrl: configured('VITE_COLLAB_URL'),
          sha256: (text) => createHash('sha256').update(text, 'utf8').digest('base64'),
        })
        return withPolicy(html, policy)
      },
    },
  }
}

/**
 * The deployment's response headers, read from `vercel.json` so that
 * `vite preview` serves the page exactly as the host does — which is what lets
 * the rooms suite test a production build under its real headers rather than
 * a second copy of them.
 */
const VERCEL = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../vercel.json', import.meta.url)), 'utf8'),
) as { headers?: { source: string; headers: { key: string; value: string }[] }[] }

const DEPLOYED_HEADERS: Record<string, string> = Object.fromEntries(
  (VERCEL.headers ?? [])
    .filter((rule) => rule.source === '/(.*)')
    .flatMap((rule) => rule.headers.map(({ key, value }) => [key, value])),
)

const benchEnabled = process.env['OPENFRAME_BENCH'] === '1'

export default defineConfig({
  plugins: [react(), benchFixtures(benchEnabled), securityPolicy()],
  resolve: { dedupe: DEDUPE },
  /*
   * A literal, not an env lookup. `define` is textual replacement, so the guard
   * folds to `false || false` in a production build and the bundler removes the
   * dev panel entirely. Reading `import.meta.env.VITE_*` at runtime would leave
   * the branch live and ship the panel to users.
   */
  define: { __OPENFRAME_BENCH__: JSON.stringify(benchEnabled) },
  server: { port: 5173 },
  preview: { headers: DEPLOYED_HEADERS },
  build: { sourcemap: true },
})
