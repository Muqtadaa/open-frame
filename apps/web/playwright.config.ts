import { defineConfig, devices } from '@playwright/test'

const isCI = process.env['CI'] !== undefined

/**
 * Some environments ship a pre-installed Chromium whose build number does not
 * match the one this Playwright version downloads (sandboxes, locked-down CI
 * images, air-gapped machines). Setting OPENFRAME_CHROMIUM_PATH points the
 * runner at that binary instead of failing with "executable doesn't exist".
 * Unset — the normal case — Playwright uses its own managed browser.
 */
const chromiumPath = process.env['OPENFRAME_CHROMIUM_PATH']

const launchOverrides =
  chromiumPath === undefined ? {} : { launchOptions: { executablePath: chromiumPath } }

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // Spread rather than `workers: undefined` — `exactOptionalPropertyTypes`
  // distinguishes "absent" from "explicitly undefined".
  ...(isCI ? { workers: 1 } : {}),
  reporter: isCI ? ([['list'], ['html', { open: 'never' }]] as const) : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    /*
     * The splash holds itself on screen for two seconds so the artwork is
     * actually seen. That is right for a person opening their board and wrong
     * for 154 specs, each of which would sit behind an opaque sheet for the
     * whole of it — about five minutes added to a two-minute suite, to re-test
     * one `setTimeout`.
     *
     * Seeded here rather than in the specs so none of them has to know: the
     * splash still appears and is still really removed, only the WAIT is gone.
     * `brand.spec.ts` clears this key to test the hold itself.
     */
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://127.0.0.1:5173',
          localStorage: [{ name: 'openframe:splash-hold', value: 'off' }],
        },
      ],
    },
  },
  projects: [
    {
      // The functional suite. Fast, deterministic, runs in CI.
      name: 'chromium',
      testIgnore: ['**/*.bench.spec.ts', '**/*.visual.spec.ts'],
      use: { ...devices['Desktop Chrome'], ...launchOverrides },
    },
    {
      /*
       * Screenshot goldens of the chrome, in both worlds. Separate because
       * goldens are platform-specific and these were taken in the development
       * container; they are the regression net for the design review's
       * stylesheet-wide passes, not yet a CI gate (review plan, B4).
       */
      name: 'visual',
      testMatch: '**/*.visual.spec.ts',
      use: { ...devices['Desktop Chrome'], ...launchOverrides },
    },
    {
      /*
       * Benchmark probes. Separated because they need generated fixtures
       * (`pnpm bench:fixtures`) and report measurements rather than asserting
       * thresholds — headless numbers are a smoke signal, not a substitute for
       * using the canvas on real hardware.
       */
      name: 'bench',
      testMatch: '**/*.bench.spec.ts',
      use: { ...devices['Desktop Chrome'], ...launchOverrides },
    },
  ],
  webServer: {
    command: 'pnpm vite --port 5173 --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !isCI,
    timeout: 60_000,
    /*
     * THE SUITE MUST NOT REACH THE REAL ROOM SERVER.
     *
     * `apps/web/.env` is committed and points `VITE_COLLAB_URL` at the
     * deployed worker, which is right for `pnpm dev` and catastrophic here:
     * several specs open `?room=brd_abcdefgh12345678`, and that is a REAL
     * Durable Object. Every CI run joined it, drew a sticky note into it and
     * left the note there — so a test asserting one object on the canvas read
     * five, then six, growing by one per run, and the assertion was really
     * against the accumulated contents of a production room.
     *
     * It passed on any machine that could not reach the worker, which is why
     * it survived: absent a connection the board is empty and the test is
     * honest. Pointing at a closed local port reproduces that state
     * deliberately instead of relying on the network being unavailable.
     *
     * Port 9 is discard — nothing listens, so the connection is refused at
     * once rather than hanging. `COLLAB_ENABLED` stays true, because the specs
     * that exercise sharing need a build that believes it collaborates; what
     * they must not have is somewhere real to do it. Rooms are tested for real
     * in `pnpm test:rooms`, against a local workerd.
     */
    env: { VITE_COLLAB_URL: 'ws://127.0.0.1:9' },
  },
})
