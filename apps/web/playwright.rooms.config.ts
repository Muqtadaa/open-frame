import { defineConfig, devices } from '@playwright/test'

const isCI = process.env['CI'] !== undefined
const chromiumPath = process.env['OPENFRAME_CHROMIUM_PATH']
const launchOverrides =
  chromiumPath === undefined ? {} : { launchOptions: { executablePath: chromiumPath } }

const ROOM_SERVER = 'http://127.0.0.1:8787'

/**
 * A production build, served as the host serves it.
 *
 * Every other spec here runs against the dev server, which carries no Content
 * Security Policy — the policy is written into the page at build time, from
 * the build's own configuration. So a policy that blocked the room's socket
 * or the splash's scripts would pass this whole suite and break the live site.
 * `content-security.spec.ts` is the one spec that opens this origin instead.
 */
const PRODUCTION_BUILD = 'http://127.0.0.1:5198'
const BUILD_DIR = 'node_modules/.openframe-csp-build'

/**
 * The collaboration suite, kept separate because it needs a server.
 *
 * `pnpm test:e2e` must stay a thing anybody can run from a clean checkout with
 * no account anywhere — so the room tests, which need `wrangler` to boot a real
 * Durable Object, live here and run under `pnpm test:rooms`.
 *
 * What they prove is the phase's own "done when": two browser windows on the
 * same URL editing the same board. Everything below that line is covered
 * in-process by `packages/collab`; this is the part only a real socket can
 * answer.
 */
export default defineConfig({
  testDir: './e2e-rooms',
  // Two browsers in one test, talking to one room: running files in parallel
  // would have them competing for the same wrangler instance.
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:5199',
    trace: 'on-first-retry',
    /*
     * The splash holds its artwork on screen for two seconds, and it is an
     * <img> over the whole viewport — so for those two seconds every click in
     * every test here lands on a picture instead of the board.
     *
     * The functional suite has seeded this since it was written; this config
     * never did, and the result was not a clean failure but a RACE. A test
     * that spent long enough getting two browsers into a room dragged a real
     * note; one that got there quickly dragged the splash. It cost an hour to
     * find, hiding as "the drag delta does not cross the room" — the gesture
     * had never started.
     */
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://127.0.0.1:5199',
          localStorage: [{ name: 'openframe:splash-hold', value: 'off' }],
        },
        {
          origin: PRODUCTION_BUILD,
          localStorage: [{ name: 'openframe:splash-hold', value: 'off' }],
        },
      ],
    },
    ...devices['Desktop Chrome'],
    ...launchOverrides,
  },
  webServer: [
    {
      // `--local` is the point: a real workerd with a real SQLite-backed
      // Durable Object, and no Cloudflare account involved. History runs on
      // seconds rather than minutes, so `history.spec.ts` sees a version
      // without waiting two minutes for editing to settle.
      command:
        'pnpm --filter @openframe/rooms exec wrangler dev --port 8787 --local --var HISTORY_TIMING:1000,3000',
      url: `${ROOM_SERVER}/health`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: 'pnpm vite --port 5199 --host 127.0.0.1',
      url: 'http://127.0.0.1:5199',
      reuseExistingServer: !isCI,
      timeout: 60_000,
      env: { VITE_COLLAB_URL: 'ws://127.0.0.1:8787' },
    },
    {
      command: `pnpm vite build --outDir ${BUILD_DIR} --emptyOutDir && pnpm vite preview --outDir ${BUILD_DIR} --port 5198 --strictPort --host 127.0.0.1`,
      url: PRODUCTION_BUILD,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: { VITE_COLLAB_URL: 'ws://127.0.0.1:8787' },
    },
  ],
})
