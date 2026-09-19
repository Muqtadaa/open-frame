import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * Alignment guides: lining a drag up with its neighbours, and showing why.
 *
 * Browser-level because it depends on pointer capture and on what is actually
 * painted mid-gesture — the guide exists only while the pointer is down, which
 * is precisely the state a unit test cannot observe.
 */

const CANVAS = '[data-testid="canvas"]'
/*
 * Whatever is currently editable in place.
 *
 * Body text is a `contenteditable` since rich text (ADR 0012); a frame's title
 * and an image's alt text are labels and stay plain textareas. A spec should
 * not have to know which it is about to type into.
 */
const EDITOR = 'textarea, [contenteditable="true"]'
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function freshBoard(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await page.evaluate(
    async () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('openframe')
        request.onsuccess = () => resolve()
        request.onerror = () => resolve()
        request.onblocked = () => resolve()
      }),
  )
  await page.reload()
  await expect(page.locator(CANVAS)).toBeVisible()
  /*
   * Also wait for the toolbar. A visible canvas only means React rendered;
   * `useKeyboardShortcuts` attaches its listener in an effect, which runs after
   * paint, so a keystroke sent on the canvas alone can land in the gap and be
   * dropped. That showed up as a rare, unexplained tool-selection failure.
   */
  await expect(page.getByTestId("tool-select")).toBeVisible()
}

async function create(page: Page, tool: string, x: number, y: number, text: string): Promise<void> {
  await page.keyboard.press(tool)
  await page.locator(CANVAS).click({ position: { x, y } })
  await expect(page.locator(EDITOR)).toBeFocused()
  await page.locator(EDITOR).fill(text)
  await page.locator(CANVAS).click({ position: { x: 1150, y: 160 } })
  await expect(page.locator(EDITOR)).toHaveCount(0)
  await page.keyboard.press('v')
}

/** Drags in steps and runs `midway` while the pointer is still down. */
async function dragWith(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  midway?: () => Promise<void>,
): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8)
  }
  if (midway !== undefined) await midway()
  await page.mouse.up()
}

const box = async (page: Page, nth: number) => {
  const result = await page.locator('[data-object-type="sticky"]').nth(nth).boundingBox()
  if (result === null) throw new Error(`no sticky at index ${String(nth)}`)
  return result
}

/**
 * Nudges the anchor OFF the grid, holding the modifier so snapping cannot pull
 * it back.
 *
 * This is what makes the rest of the suite mean anything. Both notes are
 * created on the grid, so an assertion that they end up level is satisfied by
 * grid snapping alone and says nothing about alignment. Once the anchor sits at
 * an x no grid multiple can reach, only a guide can put the mover there.
 */
async function pushAnchorOffGrid(page: Page): Promise<number> {
  const before = await box(page, 0)
  await page.keyboard.down(MOD)
  /*
   * Seven pixels, not three. Three is exactly DRAG_THRESHOLD_PX, so under load
   * the press could land on the boundary, register as a click, and leave the
   * anchor on the grid — which failed this suite intermittently rather than
   * honestly.
   */
  await dragWith(
    page,
    { x: before.x + 20, y: before.y + 20 },
    { x: before.x + 27, y: before.y + 20 },
  )
  await page.keyboard.up(MOD)

  const after = await box(page, 0)
  expect(Math.round(after.x) % 10).not.toBe(0)
  return after.x
}

test.describe('alignment guides', () => {
  test.beforeEach(async ({ page }) => {
    await freshBoard(page)
    await create(page, 's', 350, 250, 'Anchor')
    await create(page, 's', 700, 520, 'Mover')
  })

  test('shows a guide while a drag lines up, and hides it after', async ({ page }) => {
    const anchor = await box(page, 0)
    const mover = await box(page, 1)

    // Aim the mover's left edge a few pixels off the anchor's — inside the
    // capture tolerance, so a guide should appear.
    const target = anchor.x + 4

    await dragWith(
      page,
      { x: mover.x + 20, y: mover.y + 20 },
      { x: target + 20, y: mover.y + 20 },
      async () => {
        /*
         * Two notes of equal width that line up on one edge line up on all
         * three stops, so this is several guides, not one. `.first()` avoids
         * a strict-mode violation without pretending to know how many.
         */
        await expect(page.getByTestId('guide-x').first()).toBeVisible()
      },
    )

    await expect(page.getByTestId('guide-x')).toHaveCount(0)
  })

  test('pulls an edge onto a neighbour the grid could never reach', async ({ page }) => {
    const anchorX = await pushAnchorOffGrid(page)
    const mover = await box(page, 1)

    await dragWith(
      page,
      { x: mover.x + 20, y: mover.y + 20 },
      { x: anchorX + 3 + 20, y: mover.y + 20 },
    )

    const settled = await box(page, 1)
    expect(Math.abs(settled.x - anchorX)).toBeLessThan(1)
    // The decisive part: that position is not on the grid, so nothing but a
    // guide could have produced it.
    expect(Math.round(settled.x) % 10).not.toBe(0)
  })

  test('captures one axis without disturbing the other', async ({ page }) => {
    const anchorX = await pushAnchorOffGrid(page)
    const mover = await box(page, 1)
    const startY = mover.y

    await dragWith(
      page,
      { x: mover.x + 20, y: mover.y + 20 },
      { x: anchorX + 3 + 20, y: mover.y + 20 },
    )

    const settled = await box(page, 1)
    expect(Math.abs(settled.x - anchorX)).toBeLessThan(1)
    // Nothing was near vertically, so that axis fell back to the grid.
    expect(Math.abs(settled.y - startY)).toBeLessThan(10)
    expect(Math.round(settled.y) % 10).toBe(0)
  })

  test('does not grab from far away', async ({ page }) => {
    const anchorX = await pushAnchorOffGrid(page)
    const mover = await box(page, 1)

    // 40px off is well outside the capture tolerance.
    await dragWith(
      page,
      { x: mover.x + 20, y: mover.y + 20 },
      { x: anchorX + 40 + 20, y: mover.y + 20 },
    )

    const settled = await box(page, 1)
    expect(Math.abs(settled.x - anchorX)).toBeGreaterThan(20)
  })

  /** The same key that suspends grid snapping suspends guides. */
  test('the modifier suspends alignment for the gesture', async ({ page }) => {
    const anchorX = await pushAnchorOffGrid(page)
    const mover = await box(page, 1)

    await page.keyboard.down(MOD)
    await dragWith(
      page,
      { x: mover.x + 20, y: mover.y + 20 },
      { x: anchorX + 3 + 20, y: mover.y + 20 },
      async () => {
        await expect(page.getByTestId('guide-x')).toHaveCount(0)
      },
    )
    await page.keyboard.up(MOD)

    const settled = await box(page, 1)
    // Held off the guide, it keeps the 3px offset instead of being pulled level.
    expect(Math.abs(settled.x - anchorX)).toBeGreaterThan(1)
  })
})
