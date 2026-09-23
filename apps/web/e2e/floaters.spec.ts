import { expect, test, type Locator, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * Every floating surface, held to one invariant.
 *
 * These were placed by their own arithmetic — three hand-rolled clamps and
 * five stylesheet rules between them — and are now placed by one. Only the
 * last test here fails against the code it replaced; the first two passed
 * before the sweep and are guards on the conversion rather than evidence of
 * a bug it fixed. That is worth stating, because a test whose name implies
 * it caught something is a test people stop checking.
 *
 * What was genuinely broken and IS covered elsewhere: the mentions list, in
 * `comments.spec.ts`.
 *
 * Deliberately about the RECTANGLE rather than about which side was chosen.
 * "Opens upward" is a fact about one window size and would pass with the
 * defect present at another.
 */
const CANVAS = '[data-testid="canvas"]'

async function board(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await expect(page.locator(CANVAS)).toBeVisible()
  await expect(page.getByTestId('tool-select')).toBeVisible()
}

async function onScreen(page: Page, surface: Locator, what: string): Promise<void> {
  await expect(surface).toBeVisible()
  const box = await surface.boundingBox()
  const window = page.viewportSize()
  expect(box, `${what} has no box`).not.toBeNull()
  if (box === null || window === null) return

  expect(box.x, `${what} ran off the left`).toBeGreaterThanOrEqual(0)
  expect(box.y, `${what} ran off the top`).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width, `${what} ran off the right`).toBeLessThanOrEqual(window.width)
  expect(box.y + box.height, `${what} ran off the bottom`).toBeLessThanOrEqual(window.height)
}

/**
 * The colour picker, opened from the record panel.
 *
 * A surface inside a surface, which is the case worth holding: the picker is
 * placed against its swatch, and the swatch's position is itself decided by
 * the layer. Measured at three window widths before the change, the old
 * `left: calc(100% + 14px)` kept ~96px of clearance — it was a second
 * implementation, not a live overflow, and this test passes against it.
 */
test('the colour picker stays on screen, opened from a panel on the right', async ({ page }) => {
  await board(page)

  // Far right, so the panel is pushed as close to the window's edge as it goes.
  await page.getByTestId('tool-sticky').click()
  await page.locator(CANVAS).click({ position: { x: 1150, y: 300 } })
  await page.keyboard.press('Escape')
  await page.locator('[data-object-id]').first().click()

  await expect(page.getByTestId('inspector')).toBeVisible()
  await onScreen(page, page.getByTestId('inspector'), 'the record panel')

  await page.getByTestId('paint-textColor').click()
  await page.getByTestId('ink-custom').click()
  await onScreen(page, page.getByTestId('color-picker'), 'the colour picker')
})

/**
 * The context menu, at the corner it has to survive.
 *
 * It carried the third hand-rolled clamp in the product — its own margin, its
 * own layout effect, its own `Math.min` against `innerWidth` — and that clamp
 * WORKED. What it cost was a third place to fix anything about placement, and
 * a third answer to what "near the edge" means. This test passed before the
 * conversion and is here to keep it passing after.
 */
test('the context menu stays on screen in the bottom right corner', async ({ page }) => {
  await board(page)
  await page.getByTestId('tool-sticky').click()
  await page.locator(CANVAS).click({ position: { x: 1150, y: 640 } })
  await page.keyboard.press('Escape')

  await page.locator(CANVAS).click({ position: { x: 1150, y: 640 }, button: 'right' })
  await onScreen(page, page.getByTestId('context-menu'), 'the context menu')

  // And its last row is reachable, which is what being on screen is for.
  const menu = page.getByTestId('context-menu')
  await expect(menu.locator('.of-menu__item').last()).toBeVisible()
})

/**
 * The record panel must not land on the selection it describes.
 *
 * Its own arithmetic said so in as many words — "covering a neighbour is a
 * cost of floating, covering the thing you just selected is not" — and the
 * shared primitive did not, until it was taught to. Losing that rule on the
 * way in put the panel squarely on a table's column boundaries, where the
 * double-click that fits a column landed on the panel instead; the fit test
 * in `table-and-code.spec.ts` is what caught it.
 *
 * This is the one test in this file that fails against the code it replaced.
 */
test('the record panel keeps off the object it is describing', async ({ page }) => {
  await board(page)
  await page.getByTestId('tool-table').click()
  await page.locator(CANVAS).click({ position: { x: 740, y: 460 } })
  await page.getByTestId('zoom-in').click()
  await expect(page.getByTestId('zoom-percent')).toHaveText('200%')

  await page.locator('[data-object-id]').first().click()
  const grip = await page.getByTestId('divider-c0').boundingBox()
  expect(grip).not.toBeNull()
  if (grip === null) return

  /*
   * The POINT you would press, not the whole rectangle. A 360px panel beside
   * a 14px grip can share a few pixels of edge without costing anybody
   * anything; what cost the fit gesture was the panel sitting under the
   * middle of the boundary, where the double-click lands. Asserting no
   * overlap at all would be asserting more than the layer promises.
   */
  const covering = await page.evaluate(([x, y]: number[]) => {
    const found = document.elementFromPoint(x ?? 0, y ?? 0)
    return found?.closest('[data-testid="inspector"]') !== null && found !== null
  }, [grip.x + grip.width / 2, grip.y + grip.height / 2])

  expect(covering, 'the panel is over the boundary you would double-click').toBe(false)
})
