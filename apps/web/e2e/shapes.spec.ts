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

/**
 * Drawing to size, the way every graphics tool does it: press, drag out the
 * size, release. Reported missing from the deployed build.
 */
test.describe('drawing to size', () => {
  test.beforeEach(async ({ page }) => {
    await freshBoard(page)
  })

  async function drag(
    page: Page,
    from: { x: number; y: number },
    to: { x: number; y: number },
    shift = false,
  ): Promise<void> {
    const box = await page.locator(CANVAS).boundingBox()
    const origin = { x: box?.x ?? 0, y: box?.y ?? 0 }
    if (shift) await page.keyboard.down('Shift')
    await page.mouse.move(origin.x + from.x, origin.y + from.y)
    await page.mouse.down()
    await page.mouse.move(origin.x + to.x, origin.y + to.y, { steps: 12 })
    await page.mouse.up()
    if (shift) await page.keyboard.up('Shift')
    await page.keyboard.press('Escape')
    await page.keyboard.press('v')
  }

  async function lastSize(page: Page): Promise<{ w: number; h: number }> {
    const box = await page.locator('[data-object-id]').last().boundingBox()
    return { w: Math.round(box?.width ?? 0), h: Math.round(box?.height ?? 0) }
  }

  test('a shape becomes the size it was drawn', async ({ page }) => {
    await page.keyboard.press('u')
    await drag(page, { x: 200, y: 200 }, { x: 470, y: 360 })
    const { w, h } = await lastSize(page)
    // Snapped to the grid, so within a cell of the 270x160 gesture.
    expect(Math.abs(w - 270)).toBeLessThanOrEqual(10)
    expect(Math.abs(h - 160)).toBeLessThanOrEqual(10)
  })

  /** Draw-to-size must not take click-to-place away. */
  test('a click still places one at the default size', async ({ page }) => {
    await page.keyboard.press('u')
    await page.locator(CANVAS).click({ position: { x: 300, y: 300 } })
    await page.keyboard.press('Escape')
    await page.keyboard.press('v')
    const { w, h } = await lastSize(page)
    expect(w).toBe(160)
    expect(h).toBe(120)
  })

  test('Shift forces equal sides', async ({ page }) => {
    await page.keyboard.press('u')
    await drag(page, { x: 200, y: 200 }, { x: 470, y: 320 }, true)
    const { w, h } = await lastSize(page)
    expect(w).toBe(h)
  })

  test('a preview shows what will be created, and creates nothing until released', async ({
    page,
  }) => {
    await page.keyboard.press('u')
    const box = await page.locator(CANVAS).boundingBox()
    const origin = { x: box?.x ?? 0, y: box?.y ?? 0 }
    await page.mouse.move(origin.x + 200, origin.y + 200)
    await page.mouse.down()
    await page.mouse.move(origin.x + 400, origin.y + 340, { steps: 8 })

    await expect(page.getByTestId('draw-preview')).toBeVisible()
    // Nothing written yet: the gesture is interaction state until pointer-up.
    await expect(page.locator('[data-object-id]')).toHaveCount(0)

    await page.mouse.up()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-object-id]')).toHaveCount(1)
    await expect(page.getByTestId('draw-preview')).toHaveCount(0)
  })

  test('a frame is drawn to size too', async ({ page }) => {
    await page.keyboard.press('f')
    await drag(page, { x: 150, y: 150 }, { x: 600, y: 480 })
    const { w, h } = await lastSize(page)
    expect(Math.abs(w - 450)).toBeLessThanOrEqual(10)
    expect(Math.abs(h - 330)).toBeLessThanOrEqual(10)
  })

  /** One command, however many frames the drag took. */
  /**
   * Drawing disarms the tool, exactly as clicking to place does. Without it the
   * tool stays armed and the next click — the one that commits the label just
   * typed — draws a second shape on top.
   */
  test('drawing returns to the select tool', async ({ page }) => {
    await page.keyboard.press('u')
    await drag(page, { x: 200, y: 200 }, { x: 400, y: 320 })
    await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true')

    await page.locator(CANVAS).click({ position: { x: 800, y: 500 } })
    await expect(page.locator('[data-object-id]')).toHaveCount(1)
  })

  test('a drawn shape is undone in one press', async ({ page }) => {
    await page.keyboard.press('u')
    await drag(page, { x: 200, y: 200 }, { x: 470, y: 360 })
    await expect(page.locator('[data-object-id]')).toHaveCount(1)
    await page.keyboard.press('Control+z')
    await expect(page.locator('[data-object-id]')).toHaveCount(0)
  })
})
