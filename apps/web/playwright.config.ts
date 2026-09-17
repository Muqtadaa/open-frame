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
  },
  projects: [
    {
      // The functional suite. Fast, deterministic, runs in CI.
      name: 'chromium',
      testIgnore: '**/*.bench.spec.ts',
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
  },
})
