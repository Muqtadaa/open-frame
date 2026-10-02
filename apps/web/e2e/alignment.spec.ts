import type { Page } from '@playwright/test'

import { boxOf, CANVAS, drag, expect, place, test } from './fixtures.js'

/**
 * Alignment guides: lining a drag up with its neighbours, and showing why.
 *
 * Browser-level because it depends on pointer capture and on what is actually
 * painted mid-gesture — the guide exists only while the pointer is down, which
 * is precisely the state a unit test cannot observe.
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const AWAY = { x: 1150, y: 160 }

test.use({ board: 'fresh' })

async function create(page: Page, tool: string, x: number, y: number, text: string): Promise<void> {
  await place(page, tool, { x, y }, text, AWAY)
}

const box = async (page: Page, nth: number) =>
  boxOf(page.locator('[data-object-type="sticky"]').nth(nth))

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
  await drag(page, { x: before.x + 20, y: before.y + 20 }, { x: before.x + 27, y: before.y + 20 })
  await page.keyboard.up(MOD)

  const after = await box(page, 0)
  expect(Math.round(after.x) % 10).not.toBe(0)

  /*
   * DESELECT before returning, so the record panel goes away.
   *
   * The panel floats beside the selection and is over 300px tall, which on
   * this fixture lands squarely on the mover — its opacity slider ends up
   * under the point the drag starts from, and the press goes to the panel
   * instead of the note. That made this suite fail whenever the panel changed
   * height, which is nothing to do with alignment guides.
   */
  await page.locator(CANVAS).click({ position: AWAY })
  return after.x
}

test.describe('alignment guides', () => {
  test.beforeEach(async ({ page }) => {
    await create(page, 's', 350, 250, 'Anchor')
    await create(page, 's', 700, 520, 'Mover')
  })

  test('shows a guide while a drag lines up, and hides it after', async ({ page }) => {
    const anchor = await box(page, 0)
    const mover = await box(page, 1)

    // Aim the mover's left edge a few pixels off the anchor's — inside the
    // capture tolerance, so a guide should appear.
    const target = anchor.x + 4

    await drag(
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

    await drag(page, { x: mover.x + 20, y: mover.y + 20 }, { x: anchorX + 3 + 20, y: mover.y + 20 })

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

    await drag(page, { x: mover.x + 20, y: mover.y + 20 }, { x: anchorX + 3 + 20, y: mover.y + 20 })

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
    await drag(
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
    await drag(
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

/*
 * A guide said that two things lined up and nothing about how far apart they
 * were, so spacing a column evenly meant dropping each one by eye.
 */
test.describe('the distance on a guide', () => {
  test.beforeEach(async ({ page }) => {
    await create(page, 's', 350, 250, 'Anchor')
    await create(page, 's', 700, 520, 'Mover')
  })

  test('says how far the dragged note is from the one it lines up with', async ({ page }) => {
    const anchor = await box(page, 0)
    const mover = await box(page, 1)
    let said = ''

    // Lined up on the anchor's left edge, the mover's own height below it.
    await drag(
      page,
      { x: mover.x + 20, y: mover.y + 20 },
      { x: anchor.x + 2 + 20, y: anchor.y + anchor.height * 2 + 20 },
      async () => {
        const gap = page.getByTestId('guide-gap-x')
        await expect(gap).toHaveCount(1)
        said = (await gap.textContent()) ?? ''
      },
    )

    const settled = await box(page, 1)
    // What it said mid-drag is the gap it then left, in board units at 100%.
    expect(Number(said)).toBeCloseTo(settled.y - (anchor.y + anchor.height), -1)
    await expect(page.getByTestId('guide-gap-x')).toHaveCount(0)
  })
})
