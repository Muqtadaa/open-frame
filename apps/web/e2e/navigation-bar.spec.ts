import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * The board's navigation, along the top.
 *
 * The way out, the board's name, history and the rest of the record line sat
 * at the bottom of the window, where nothing reads as the page's own heading.
 * They are the page's navigation, so they sit where navigation is looked for,
 * and the name reads as the name of the page rather than as one more readout.
 */
const CANVAS = '[data-testid="canvas"]'

async function board(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await expect(page.locator(CANVAS)).toBeVisible()
  await expect(page.getByTestId('tool-select')).toBeVisible()
}

test('sits along the top of the window, above the rail', async ({ page }) => {
  await board(page)
  const bar = await page.getByTestId('status-bar').boundingBox()
  const rail = await page.getByRole('toolbar', { name: 'Board tools' }).boundingBox()
  if (bar === null || rail === null) throw new Error('bar or rail is not on screen')
  expect(bar.y).toBeLessThan(40)
  expect(rail.y).toBeGreaterThanOrEqual(bar.y + bar.height)
})

test('names the board in the interface’s own voice, not as a readout', async ({ page }) => {
  await board(page)
  const title = page.getByTestId('board-title')
  await expect(title).toHaveCSS('font-weight', '600')
  const face = await title.evaluate((el) => getComputedStyle(el).fontFamily)
  expect(face).not.toMatch(/mono/i)
})

test('opens its tips downward, into the window', async ({ page }) => {
  await board(page)
  await page.getByTestId('undo').focus()
  const tip = await page.getByTestId('undo').evaluate((el) => {
    const after = getComputedStyle(el, '::after')
    return { top: after.top, bottom: after.bottom }
  })
  expect(Number.parseFloat(tip.top)).toBeGreaterThan(0)
})

test('keeps an object’s panel clear of it, however high the object sits', async ({ page }) => {
  await board(page)
  await page.keyboard.press('s')
  // A note placed high enough that its top edge is under the bar.
  await page.locator(CANVAS).click({ position: { x: 500, y: 110 } })
  await page.locator(CANVAS).click({ position: { x: 1100, y: 600 } })
  await page.keyboard.press('v')
  const bar = await page.getByTestId('status-bar').boundingBox()
  const note = await page.locator('[data-object-type="sticky"]').boundingBox()
  if (bar === null || note === null) throw new Error('bar or note is not on screen')
  expect(note.y).toBeLessThan(bar.y + bar.height)
  await page.mouse.click(note.x + 20, note.y + note.height - 20)
  const panel = await page.getByTestId('inspector').boundingBox()
  if (panel === null) throw new Error('the panel is not on screen')
  expect(panel.y).toBeGreaterThanOrEqual(bar.y + bar.height)
})
