import { expect, test } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * A reader's text size reaches the interface, and never the board
 * (audit 2026-09-27).
 *
 * Every type size was in px, so a browser's text-size preference changed
 * nothing. The interface now follows it; what is ON the board is content in
 * world units, and must lay out the same for everybody looking at it.
 */
test('a larger text size grows the interface and leaves the board alone', async ({ page }) => {
  await page.goto(BOARD_URL)
  await page.waitForSelector('[data-testid="status-bar"]')
  await page.keyboard.press('s')
  await page.locator('[data-testid="canvas"]').click({ position: { x: 400, y: 300 } })
  await page.keyboard.type('Pricing')
  await page.keyboard.press('Escape')

  const sizes = () =>
    page.evaluate(() => ({
      bar: Number.parseFloat(
        getComputedStyle(document.querySelector('[data-testid="save-state"]') ?? document.body)
          .fontSize,
      ),
      note: Number.parseFloat(
        getComputedStyle(
          document.querySelector('[data-object-type="sticky"] [role="group"]') ?? document.body,
        ).fontSize,
      ),
    }))

  const before = await sizes()
  // What a browser's "larger text" setting does: a larger root font size.
  await page.addStyleTag({ content: 'html { font-size: 24px !important; }' })
  const after = await sizes()

  expect(after.bar).toBeCloseTo(before.bar * 1.5, 1)
  expect(after.note).toBe(before.note)
})
