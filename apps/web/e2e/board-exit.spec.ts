import { expect, test } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * The way out of a board.
 *
 * There was none. Not a link, not a shortcut, not a logo — a grep across the
 * whole board UI for a route home returned `HOME_HREF` exported and used by
 * nothing. You opened a board and the only exit was editing the URL, which is
 * the kind of gap that survives precisely because everyone testing it already
 * knows the query string.
 */

test.beforeEach(async ({ page }) => {
  await page.goto(BOARD_URL)
  await page.waitForSelector('[data-testid="status-bar"]')
})

test('leads back to the board list', async ({ page }) => {
  await page.getByTestId('board-exit').click()

  await expect(page.getByTestId('home')).toBeVisible()
  expect(new URL(page.url()).search).toBe('')
})

/**
 * It is an anchor, and that is load-bearing.
 *
 * Keeping the board you are on while you look at the list is a normal thing to
 * want, and cmd-click, middle-click and "open in new tab" are how people do
 * it. A button that navigates in its click handler throws all three away and
 * nothing tells you — the control still looks and behaves like a link.
 */
test('is a real link, so it can be opened in a new tab', async ({ page }) => {
  const exit = page.getByTestId('board-exit')

  expect(await exit.evaluate((node) => node.tagName)).toBe('A')
  expect(await exit.getAttribute('href')).toBe('/')
})

/**
 * THE ONE THAT MATTERS.
 *
 * Autosave coalesces commands into one write 500ms later, so the board on
 * screen is routinely ahead of the board on disk. Before there was a way out,
 * hitting that window took closing the tab within half a second of typing;
 * a one-click exit turns it into an ordinary thing to do.
 *
 * This is a race by nature — a slow enough round trip lets autosave fire on
 * its own and the test passes for the wrong reason. `adapters.test.ts` holds
 * the deterministic version, which drives the window directly.
 */
test('does not leave the last edit behind', async ({ page }) => {
  await page.locator('[data-testid="board-title"]').click()
  await page.locator('[data-testid="board-title-input"]').fill('Left in a hurry')
  await page.locator('[data-testid="board-title-input"]').press('Enter')

  // Immediately, in the same breath as the rename — not after waiting for a
  // save that is the thing under test.
  await page.evaluate(() => {
    document.querySelector<HTMLAnchorElement>('[data-testid="board-exit"]')?.click()
  })

  await expect(page.getByTestId('home')).toBeVisible()
  await expect(page.getByTestId('home-boards')).toContainText('Left in a hurry')
})
