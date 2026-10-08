import { expect, test } from '@playwright/test'

import { BOARD_URL } from './routes.js'
import { goto } from './fixtures.js'

/**
 * The board page has landmarks a screen reader can jump between, in the order
 * the page reads (audit 2026-09-27).
 *
 * The board was not in any landmark at all, so "next landmark" went from the
 * navigation straight past it; and the canvas came first in the DOM, so the
 * record panel's heading — docked on the canvas's chrome layer at phone width —
 * was read before the page's own h1.
 */
test.beforeEach(async ({ page }) => {
  await goto(page, BOARD_URL)
  await page.waitForSelector('[data-testid="status-bar"]')
})

test('the board, the rail and the zoom are the main content', async ({ page }) => {
  const main = page.getByRole('main', { name: 'Board' })
  await expect(main).toHaveCount(1)
  await expect(main.getByTestId('canvas')).toHaveCount(1)
  await expect(main.getByRole('toolbar').first()).toBeVisible()
  await expect(main.getByTestId('zoom-control')).toHaveCount(1)
  // The navigation is its own landmark, and is not inside main.
  await expect(main.getByTestId('status-bar')).toHaveCount(0)
})

test('the navigation and its h1 come before everything else on the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  await page.keyboard.press('s')
  await page.getByTestId('canvas').click({ position: { x: 200, y: 400 } })
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('inspector')).toBeVisible()

  const order = await page.evaluate(() => {
    const headings = [...document.querySelectorAll('h1, h2, h3')].map((h) => h.tagName)
    const nav = document.querySelector('[data-testid="status-bar"]')
    const main = document.querySelector('main')
    const navFirst =
      nav !== null &&
      main !== null &&
      (nav.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    return { first: headings[0], navFirst }
  })
  expect(order.first).toBe('H1')
  expect(order.navFirst).toBe(true)
})
