import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * A line's pattern, on everything that offers one.
 *
 * `dash` is declared by two types and the inspector reads that declaration,
 * so the control appears for both — which is exactly the arrangement rule 21
 * warns about when a VIEW does not honour what its type claims. That is what
 * happened here.
 */
const CANVAS = '[data-testid="canvas"]'

async function board(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await expect(page.locator(CANVAS)).toBeVisible()
  await expect(page.getByTestId('tool-select')).toBeVisible()
}

async function shape(page: Page, at: { x: number; y: number }): Promise<void> {
  await page.getByTestId('tool-shape').click()
  await page.locator(CANVAS).click({ position: at })
  await page.keyboard.press('Escape')
  await page.locator('[data-object-id]').first().click()
  await expect(page.getByTestId('inspector')).toBeVisible()
}

test.describe('a line pattern reaches the shape it is set on', () => {
  test('dashes a rectangle, which is drawn as a path', async ({ page }) => {
    await board(page)
    await shape(page, { x: 600, y: 320 })

    const outline = page.locator('.of-shape__svg path').first()
    await expect(outline).toHaveCount(1)

    await page.getByTestId('line-dashed').click()
    const pattern = await outline.getAttribute('stroke-dasharray')
    expect(pattern, 'the rectangle ignored the pattern entirely').not.toBeNull()
    expect(pattern).not.toBe('')
  })

  /**
   * Dotted is a zero-length dash, which only becomes a dot under a ROUND cap.
   * With the default butt cap it draws nothing at all — a stroke that is set,
   * declared, and invisible.
   */
  test('dots an ellipse, which needs a round cap to be dots at all', async ({ page }) => {
    await board(page)
    await page.getByTestId('tool-shape').click()
    // Cycle to the ellipse, which is the one shape drawn as an <ellipse>.
    await page.keyboard.press('u')
    await page.locator(CANVAS).click({ position: { x: 600, y: 320 } })
    await page.keyboard.press('Escape')
    await page.locator('[data-object-id]').first().click()

    const outline = page.locator('.of-shape__svg ellipse, .of-shape__svg path').first()
    await page.getByTestId('line-dotted').click()

    expect(await outline.getAttribute('stroke-dasharray')).not.toBeNull()
    expect(
      await outline.getAttribute('stroke-linecap'),
      'a zero-length dash with a butt cap draws nothing',
    ).toBe('round')
  })

  /**
   * EVERY variant, because the bug lived in one of two branches.
   *
   * `ShapeView` draws the ellipse as an `<ellipse>` and the other seven as a
   * `<path>`, and only the first branch had the pattern — so a test that
   * checked the source mentioned `dashArray`, or that checked one variant,
   * would have passed with five of them broken. The only guard that catches
   * this is the one that sets it on each.
   */
  test('dashes every variant, not just the branch that had it', async ({ page }) => {
    const KINDS = 8
    await board(page)

    for (let index = 0; index < KINDS; index += 1) {
      await page.getByTestId('tool-shape').click()
      // The rail cycles the variant; one press per step from rectangle.
      for (let step = 0; step < index; step += 1) await page.keyboard.press('u')
      await page.locator(CANVAS).click({ position: { x: 600, y: 320 } })
      await page.keyboard.press('Escape')

      const object = page.locator('[data-object-id]').first()
      await object.click()
      await page.getByTestId('line-dashed').click()

      const outline = page.locator('.of-shape__svg ellipse, .of-shape__svg path').first()
      expect(
        await outline.getAttribute('stroke-dasharray'),
        `variant ${String(index)} ignored the pattern`,
      ).not.toBeNull()

      await page.keyboard.press('Delete')
      await page.keyboard.press('v')
    }
  })

  test('and solid puts it back', async ({ page }) => {
    await board(page)
    await shape(page, { x: 600, y: 320 })

    await page.getByTestId('line-dashed').click()
    await page.getByTestId('line-solid').click()
    const outline = page.locator('.of-shape__svg path').first()
    expect(await outline.getAttribute('stroke-dasharray')).toBeNull()
  })
})

/**
 * Resizing from anywhere along an edge.
 *
 * Only the square at the middle of each edge used to answer, so on a long
 * edge that was one target in several hundred pixels of the thing that looks
 * like the target — a user hunting for pixels rather than using an interface.
 */
test.describe('an edge resizes, not just the square on it', () => {
  const widthOf = async (page: Page): Promise<number> =>
    await page
      .locator('[data-object-id]')
      .first()
      .evaluate((el) => (el as HTMLElement).getBoundingClientRect().width)

  test('pulls from a point nowhere near the midpoint handle', async ({ page }) => {
    await board(page)
    await shape(page, { x: 600, y: 320 })

    const before = await widthOf(page)
    const edge = await page.getByTestId('edge-e').boundingBox()
    const midpoint = await page.getByTestId('handle-e').boundingBox()
    expect(edge).not.toBeNull()
    expect(midpoint).not.toBeNull()
    if (edge === null || midpoint === null) return

    // A quarter of the way down the edge, which is well clear of the square
    // at its middle and of both corners.
    const grabY = edge.y + edge.height * 0.25
    expect(
      Math.abs(grabY - (midpoint.y + midpoint.height / 2)),
      'the fixture grabbed the midpoint after all',
    ).toBeGreaterThan(midpoint.height)

    await page.mouse.move(edge.x + edge.width / 2, grabY)
    await page.mouse.down()
    await page.mouse.move(edge.x + edge.width / 2 + 80, grabY, { steps: 8 })
    await page.mouse.up()

    expect(await widthOf(page)).toBeGreaterThan(before + 40)
  })

  test('offers the resize cursor along the whole edge', async ({ page }) => {
    await board(page)
    await shape(page, { x: 600, y: 320 })
    await expect(page.getByTestId('edge-e')).toHaveCSS('cursor', 'ew-resize')
    await expect(page.getByTestId('edge-s')).toHaveCSS('cursor', 'ns-resize')
  })

  /**
   * The corner resizes on BOTH axes and is the more specific gesture, so the
   * strips stop short of it rather than relying on which of two overlapping
   * elements happens to be painted last.
   */
  test('leaves the corners to the corner handles', async ({ page }) => {
    await board(page)
    await shape(page, { x: 600, y: 320 })

    const edge = await page.getByTestId('edge-n').boundingBox()
    const corner = await page.getByTestId('handle-nw').boundingBox()
    if (edge === null || corner === null) return
    expect(edge.x, 'the strip runs into the corner').toBeGreaterThanOrEqual(
      corner.x + corner.width,
    )
  })
})

/**
 * One outline while drawing, not two.
 *
 * The container's dashed border is the preview for a type this overlay
 * cannot draw. A rectangle's own path IS that box, so both were drawn and
 * the pointer dragged two dashed rectangles, one inset in the other by the
 * geometry's margin.
 */
test.describe('the outline that follows the pointer', () => {
  const startDraw = async (page: Page): Promise<void> => {
    await page.getByTestId('tool-shape').click()
    await page.mouse.move(420, 260)
    await page.mouse.down()
    await page.mouse.move(700, 460, { steps: 6 })
  }

  test('draws the shape once, not the shape and its box', async ({ page }) => {
    await board(page)
    await startDraw(page)

    const preview = page.getByTestId('draw-preview')
    await expect(preview).toBeVisible()
    await expect(preview.locator('svg path, svg ellipse')).toHaveCount(1)
    // The box is suppressed: the shape's own outline is the preview.
    await expect(preview).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)')

    await page.mouse.up()
  })

  /** And a type with no outline of its own still gets the box. */
  test('keeps the box for something it cannot draw', async ({ page }) => {
    await board(page)
    await page.getByTestId('tool-frame').click()
    await page.mouse.move(420, 260)
    await page.mouse.down()
    await page.mouse.move(700, 460, { steps: 6 })

    const preview = page.getByTestId('draw-preview')
    await expect(preview).toBeVisible()
    await expect(preview.locator('svg path, svg ellipse')).toHaveCount(0)
    await expect(preview).not.toHaveCSS('border-color', 'rgba(0, 0, 0, 0)')

    await page.mouse.up()
  })
})
