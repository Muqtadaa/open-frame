import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * The tool rail's two menus, on the one surface everything floating uses.
 *
 * They used to pin themselves to the rail slot with `position: absolute;
 * top: 0`, which has no idea how tall the window is. The SHORT WINDOW is the
 * whole point of this file: at the default size both menus happen to fit, so a
 * suite that never resizes passes against the bug.
 */
const CANVAS = '[data-testid="canvas"]'

async function board(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await expect(page.locator(CANVAS)).toBeVisible()
  await expect(page.getByTestId('tool-select')).toBeVisible()
}

/** How far past the bottom of the window something reaches. */
async function overhang(page: Page, testId: string): Promise<number> {
  const box = await page.getByTestId(testId).boundingBox()
  if (box === null) throw new Error(`${testId} is not on screen`)
  const height = page.viewportSize()?.height ?? 0
  return box.y + box.height - height
}

test.describe('on a short window', () => {
  test.use({ viewport: { width: 1000, height: 420 } })

  test('the table size picker stays on screen', async ({ page }) => {
    await board(page)
    await page.getByTestId('table-menu').click()

    /*
     * The measured failure: 187 pixels of picker starting at y=281 in a
     * 420-pixel window ran 48 pixels past the bottom, where nothing could
     * reach it. A bare `toBeVisible` would not have caught that — the element
     * was rendered and visible, just not on the screen.
     */
    expect(await overhang(page, 'table-size-flyout')).toBeLessThanOrEqual(0)
    await expect(page.getByTestId('table-size-picker')).toBeVisible()
  })

  test('the shape menu stays on screen', async ({ page }) => {
    await board(page)
    await page.getByTestId('shape-menu').click()
    expect(await overhang(page, 'shape-flyout')).toBeLessThanOrEqual(0)
  })
})

test('only one rail menu is open at a time', async ({ page }) => {
  await board(page)

  await page.getByTestId('table-menu').click()
  await expect(page.getByTestId('table-size-flyout')).toBeVisible()

  /*
   * Two independent booleans let both stand open at once, stacked over each
   * other in the same strip beside the rail.
   */
  await page.getByTestId('shape-menu').click()
  await expect(page.getByTestId('shape-flyout')).toBeVisible()
  await expect(page.getByTestId('table-size-flyout')).toHaveCount(0)
})

test('the size picker still picks a size', async ({ page }) => {
  await board(page)
  await page.getByTestId('table-menu').click()
  await page.getByTestId('table-size-3x4').click()
  await expect(page.getByTestId('table-size-flyout')).toHaveCount(0)

  await page.locator(CANVAS).click({ position: { x: 520, y: 300 } })
  await page.keyboard.press('Escape')
  await page.keyboard.press('v')

  // Three columns across, four rows down: twelve cells.
  await expect(page.locator('[role="table"] > *')).toHaveCount(12)
})

test('the shape menu still picks a shape', async ({ page }) => {
  await board(page)
  await page.getByTestId('shape-menu').click()
  await page.getByTestId('shape-diamond').click()
  await expect(page.getByTestId('shape-flyout')).toHaveCount(0)

  await page.locator(CANVAS).click({ position: { x: 520, y: 300 } })
  await page.keyboard.press('Escape')
  await page.keyboard.press('v')
  await expect(page.locator('[data-object-type="shape"]')).toHaveCount(1)
})
