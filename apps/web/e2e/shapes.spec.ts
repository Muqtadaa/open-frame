import { expect, test, type Page } from '@playwright/test'

/**
 * The shape palette, and the label geometry that made the triangle look broken.
 */

const CANVAS = '[data-testid="canvas"]'

const KINDS = [
  'rectangle',
  'ellipse',
  'triangle',
  'diamond',
  'hexagon',
  'trapezoid',
  'parallelogram',
  'octagon',
] as const

async function freshBoard(page: Page): Promise<void> {
  await page.goto('/')
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

async function place(page: Page, kind: string, label: string): Promise<void> {
  await page.keyboard.press('u')
  await page.getByTestId('shape-menu').click()
  await page.getByTestId(`shape-${kind}`).click()
  await page.locator(CANVAS).click({ position: { x: 500, y: 350 } })
  await page.locator('textarea').fill(label)
  await page.locator(CANVAS).click({ position: { x: 1100, y: 620 } })
  await page.keyboard.press('v')
}

test.describe('shapes', () => {
  test.beforeEach(async ({ page }) => {
    await freshBoard(page)
  })

  test('offers every kind in the picker', async ({ page }) => {
    await page.keyboard.press('u')
    await page.getByTestId('shape-menu').click()
    for (const kind of KINDS) {
      await expect(page.getByTestId(`shape-${kind}`)).toBeVisible()
    }
  })

  for (const kind of KINDS) {
    test(`places a ${kind} and keeps its label inside the outline`, async ({ page }) => {
      await place(page, kind, 'Review')

      const shape = page.locator('[data-object-type="shape"]')
      await expect(shape).toContainText('Review')

      const outline = await shape.locator('.of-shape__svg').boundingBox()
      const label = await shape.locator('.of-shape__label').boundingBox()
      expect(outline).not.toBeNull()
      expect(label).not.toBeNull()
      if (outline === null || label === null) return

      /*
       * The bug this guards: with a uniform inset the triangle's label sat in
       * the middle of the bounding box, where the shape has no room, and ran
       * out through the sloped sides. The label box must stay strictly inside
       * the outline's box for every kind — necessary, not sufficient, but it is
       * what a browser can check. The exact fit against the real polygon is
       * covered by scene/shape-geometry.test.ts.
       */
      expect(label.x).toBeGreaterThan(outline.x)
      expect(label.y).toBeGreaterThan(outline.y)
      expect(label.x + label.width).toBeLessThan(outline.x + outline.width)
      expect(label.y + label.height).toBeLessThan(outline.y + outline.height)
    })
  }

  test('a triangle label sits low, where the shape is actually wide', async ({ page }) => {
    await place(page, 'triangle', 'Review')

    const outline = await page.locator('.of-shape__svg').boundingBox()
    const label = await page.locator('.of-shape__label').boundingBox()
    if (outline === null || label === null) throw new Error('missing geometry')

    // Its centre must be below the vertical midpoint — the apex half is empty.
    const labelCentre = label.y + label.height / 2
    expect(labelCentre).toBeGreaterThan(outline.y + outline.height / 2)
  })
})
