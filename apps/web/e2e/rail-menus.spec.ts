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

/**
 * Reaching the menus at all.
 *
 * The only way in was a 16-pixel chevron tucked inside the tool's corner: too
 * small to aim at, overlapping the tool it belonged to, and — until the keymap
 * stopped claiming Enter — impossible to press from the keyboard. Once open, a
 * menu ignored Escape and the board, and closed only when something in it was
 * chosen.
 */
test.describe('opening, walking and leaving a rail menu', () => {
  test.beforeEach(async ({ page }) => {
    await board(page)
  })

  test('a second press on the armed Shape opens its menu', async ({ page }) => {
    await page.getByTestId('tool-shape').click()
    await expect(page.getByTestId('shape-flyout')).toHaveCount(0)
    await page.getByTestId('tool-shape').click()
    await expect(page.getByTestId('shape-flyout')).toBeVisible()
    // Opening is not choosing: the kind it had is the kind it keeps.
    await expect(page.getByTestId('shape-rectangle')).toHaveAttribute('aria-checked', 'true')
  })

  test('Escape closes a menu and hands focus back', async ({ page }) => {
    await page.getByTestId('shape-menu').click()
    await expect(page.getByTestId('shape-flyout')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('shape-flyout')).toHaveCount(0)
    await expect(page.getByTestId('shape-menu')).toBeFocused()
  })

  test('a press on the board closes a menu', async ({ page }) => {
    await page.getByTestId('table-menu').click()
    await expect(page.getByTestId('table-size-flyout')).toBeVisible()
    await page.locator(CANVAS).click({ position: { x: 900, y: 500 } })
    await expect(page.getByTestId('table-size-flyout')).toHaveCount(0)
  })

  test('the keyboard opens the shape menu, walks it and chooses', async ({ page }) => {
    await page.getByTestId('tool-shape').focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('shape-rectangle')).toBeFocused()

    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('shape-ellipse')).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    // Wraps from the first to the last, as a menu does.
    await expect(page.getByTestId('shape-flyout').getByRole('menuitemradio').last()).toBeFocused()
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    await expect(page.getByTestId('shape-flyout')).toHaveCount(0)
    await page.getByTestId('shape-menu').click()
    await expect(page.getByTestId('shape-ellipse')).toHaveAttribute('aria-checked', 'true')
  })

  test('the keyboard picks a table size', async ({ page }) => {
    await page.getByTestId('tool-table').focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('table-size-3x3')).toBeFocused()

    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('table-size-4x4')).toBeFocused()
    await expect(page.getByTestId('table-size-readout')).toHaveText('4 columns × 4 rows')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('table-size-flyout')).toHaveCount(0)

    await page.locator(CANVAS).click({ position: { x: 600, y: 300 } })
    await page.keyboard.press('Escape')
    await expect(page.locator('[role="table"] > *')).toHaveCount(16)
  })

  test('a size cell is one Tab stop, not sixty-four', async ({ page }) => {
    await page.getByTestId('table-menu').click()
    const stops = await page
      .getByTestId('table-size-picker')
      .locator('[role="gridcell"]:not([tabindex="-1"])')
      .count()
    expect(stops).toBe(1)
  })

  test('the disclosures are a target of their own', async ({ page }) => {
    for (const [menu, tool] of [
      ['shape-menu', 'tool-shape'],
      ['table-menu', 'tool-table'],
    ] as const) {
      const strip = await page.getByTestId(menu).boundingBox()
      const owner = await page.getByTestId(tool).boundingBox()
      if (strip === null || owner === null) throw new Error(`${menu} is not on screen`)
      expect(strip.height).toBeGreaterThanOrEqual(24)
      // Beside the tool, never inside it: a press on the tool's edge arms it.
      expect(strip.x).toBeGreaterThanOrEqual(owner.x + owner.width)
    }
  })

  test('size cells are a target a hand can hit', async ({ page }) => {
    await page.getByTestId('table-menu').click()
    const cell = await page.getByTestId('table-size-1x1').boundingBox()
    expect(cell?.width).toBeGreaterThanOrEqual(24)
    expect(cell?.height).toBeGreaterThanOrEqual(24)
  })
})

/**
 * The rail itself on a short window. It was a fixed 599 pixels, centred on
 * the WINDOW: at 640 tall it met the record line, at 560 it began 19 pixels
 * above the top, with Select and Image cut off and nothing to scroll.
 */
for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1280, height: 640 },
  { width: 1280, height: 560 },
  { width: 760, height: 700 },
]) {
  test(`the rail fits a ${String(viewport.width)}×${String(viewport.height)} window`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await board(page)
    const rail = await page.getByRole('toolbar', { name: 'Board tools' }).boundingBox()
    const line = await page.getByTestId('status-bar').boundingBox()
    if (rail === null || line === null) throw new Error('rail or record line is not on screen')

    expect(rail.y).toBeGreaterThanOrEqual(0)
    // Above the record line, never under it.
    expect(rail.y + rail.height).toBeLessThanOrEqual(line.y)
    // Every tool whole, without scrolling to it.
    for (const id of ['tool-select', 'tool-comment', 'tool-image']) {
      const tool = await page.getByTestId(id).boundingBox()
      expect(tool, id).not.toBeNull()
      expect(tool?.y ?? -1, id).toBeGreaterThanOrEqual(rail.y)
      expect((tool?.y ?? 0) + (tool?.height ?? 0), id).toBeLessThanOrEqual(rail.y + rail.height)
      expect(tool?.height ?? 0, id).toBeGreaterThanOrEqual(30)
    }
  })
}
