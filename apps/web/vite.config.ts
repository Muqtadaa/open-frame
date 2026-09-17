import { createReadStream, existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

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

const benchEnabled = process.env['OPENFRAME_BENCH'] === '1'

export default defineConfig({
  plugins: [react(), benchFixtures(benchEnabled)],
  /*
   * A literal, not an env lookup. `define` is textual replacement, so the guard
   * folds to `false || false` in a production build and the bundler removes the
   * dev panel entirely. Reading `import.meta.env.VITE_*` at runtime would leave
   * the branch live and ship the panel to users.
   */
  define: { __OPENFRAME_BENCH__: JSON.stringify(benchEnabled) },
  server: { port: 5173 },
  build: { sourcemap: true },
})
