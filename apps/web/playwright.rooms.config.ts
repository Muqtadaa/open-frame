import { defineConfig, devices } from '@playwright/test'

const isCI = process.env['CI'] !== undefined
const chromiumPath = process.env['OPENFRAME_CHROMIUM_PATH']
const launchOverrides =
  chromiumPath === undefined ? {} : { launchOptions: { executablePath: chromiumPath } }

const ROOM_SERVER = 'http://127.0.0.1:8787'

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
      ],
    },
    ...devices['Desktop Chrome'],
    ...launchOverrides,
  },
  webServer: [
    {
      // `--local` is the point: a real workerd with a real SQLite-backed
      // Durable Object, and no Cloudflare account involved.
      command: 'pnpm --filter @openframe/rooms exec wrangler dev --port 8787 --local',
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
  ],
})
