import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL, HOME_URL } from './routes.js'

/**
 * Code a page does not use is not downloaded (audit 2026-09-27).
 *
 * The app shipped as one 999KB entry chunk, and about 290KB of it was the
 * identity client and the collaboration code — which a local board and a
 * signed-out front door never run. They are loaded when they are needed.
 * The dev server serves each dependency as a module of its own, so whether
 * the page asked for one is a question the network can answer.
 */
function loaded(page: Page): string[] {
  const seen: string[] = []
  page.on('request', (request) => {
    seen.push(request.url())
  })
  return seen
}

// The dependencies themselves — the weight — not the app's own small adapters.
const SUPABASE = '.vite/deps/@supabase'
const YJS = /\.vite\/deps\/(yjs|y-protocols|lib0)/

test('a local board loads neither the identity client nor the collaboration code', async ({
  page,
}) => {
  const seen = loaded(page)
  await page.goto(BOARD_URL)
  await page.waitForSelector('[data-testid="status-bar"]')
  await expect(page.locator('#of-splash')).toHaveCount(0)
  expect(seen.filter((url) => url.includes(SUPABASE))).toEqual([])
  expect(seen.filter((url) => YJS.test(url))).toEqual([])
})

test('the signed-out front door does not load the collaboration code', async ({ page }) => {
  const seen = loaded(page)
  await page.goto(HOME_URL)
  await page.waitForSelector('[data-testid="home"]')
  expect(seen.filter((url) => YJS.test(url))).toEqual([])
})

test('a shared board still loads the collaboration code it needs', async ({ page }) => {
  const seen = loaded(page)
  await page.routeWebSocket(/\/room\//, () => undefined)
  await page.goto(`/?room=brd_abcdefgh12345678&k=${'e'.repeat(32)}`)
  await page.waitForSelector('[data-testid="status-bar"]')
  expect(seen.filter((url) => YJS.test(url)).length).toBeGreaterThan(0)
})
