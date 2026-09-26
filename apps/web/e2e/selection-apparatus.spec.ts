import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * The selection apparatus tells the truth about what is selected, where it is
 * NOW — during a gesture as well as after one (C3 #7).
 */
const CANVAS = '[data-testid="canvas"]'
const EDITOR = '[contenteditable="true"]'
const AWAY = { x: 1180, y: 120 }

async function board(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await expect(page.locator(CANVAS)).toBeVisible()
  await expect(page.getByTestId('tool-select')).toBeVisible()
}

async function note(page: Page, at: { x: number; y: number }, text: string): Promise<void> {
  await page.keyboard.press('s')
  await expect(page.getByTestId('tool-sticky')).toHaveAttribute('aria-pressed', 'true')
  await page.locator(CANVAS).click({ position: at })
  await expect(page.locator(EDITOR)).toBeFocused()
  await page.keyboard.type(text)
  await page.locator(CANVAS).click({ position: AWAY })
  await expect(page.locator(EDITOR)).toHaveCount(0)
  await page.keyboard.press('v')
}

async function canvasPoint(page: Page, at: { x: number; y: number }) {
  const canvas = await page.locator(CANVAS).boundingBox()
  if (canvas === null) throw new Error('no canvas')
  return { x: canvas.x + at.x, y: canvas.y + at.y }
}

test.beforeEach(async ({ page }) => {
  await board(page)
})

/*
 * The box and its eight handles stayed where the note WAS while the note moved
 * under the pointer — on the most frequent gesture on the board, a detached
 * frame that looked like a glitch.
 */
test('the box travels with a moving selection', async ({ page }) => {
  await note(page, { x: 340, y: 260 }, 'Moving')
  const object = page.locator('[data-object-type="sticky"]')
  await object.click()
  const start = await object.boundingBox()
  if (start === null) throw new Error('no note')

  const from = { x: start.x + start.width / 2, y: start.y + start.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) await page.mouse.move(from.x + 25 * i, from.y + 15 * i)

  const moved = await object.boundingBox()
  const box = await page.getByTestId('selection-overlay').boundingBox()
  if (moved === null || box === null) throw new Error('nothing to measure')
  // The note really moved, so the comparison below is not vacuous.
  expect(moved.x - start.x).toBeGreaterThan(100)
  expect(Math.abs(box.x - moved.x)).toBeLessThan(2)
  expect(Math.abs(box.y - moved.y)).toBeLessThan(2)
  await page.mouse.up()
})

/*
 * A line's apparatus is its ends. The box drawn around one as well was a
 * rectangle nobody could use — and it went stale while the line was reshaped.
 */
test('a lone connector is selected by its ends, not by a box', async ({ page }) => {
  await note(page, { x: 280, y: 250 }, 'A')
  await note(page, { x: 780, y: 470 }, 'B')
  await page.keyboard.press('c')
  const from = await canvasPoint(page, { x: 280, y: 250 })
  const to = await canvasPoint(page, { x: 780, y: 470 })
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8)
  }
  await page.mouse.up()
  await page.keyboard.press('v')
  await page.locator('.of-connector__line').click({ force: true })

  await expect(page.getByTestId('endpoint-from')).toBeVisible()
  await expect(page.getByTestId('selection-overlay')).toHaveCount(0)
})

/**
 * The press target a grip really offers: its `__target` child if it has one,
 * which is what receives the press, otherwise the grip itself.
 */
async function targets(
  page: Page,
  selector: string,
): Promise<{ id: string; w: number; h: number }[]> {
  return page.locator(selector).evaluateAll((grips) =>
    grips.map((grip) => {
      const target = grip.querySelector('[class$="__target"]') ?? grip
      const box = target.getBoundingClientRect()
      return {
        id: grip.getAttribute('data-testid') ?? grip.className,
        w: Math.round(box.width * 10) / 10,
        h: Math.round(box.height * 10) / 10,
      }
    }),
  )
}

function atLeast24(found: readonly { id: string; w: number; h: number }[]): void {
  expect(found.length).toBeGreaterThan(0)
  for (const grip of found) {
    expect(
      Math.min(grip.w, grip.h),
      `${grip.id} is ${String(grip.w)}×${String(grip.h)}`,
    ).toBeGreaterThanOrEqual(24)
  }
}

/*
 * WCAG 2.5.8: a pointer target is 24px, whatever is drawn. The grips were
 * 24, 22, 14, 12, 10 and 9 depending on the family — and the finest gesture on
 * the board, placing a line's end, had the smallest.
 */
test.describe('every grip is a 24px target', () => {
  test('resize handles and connect points', async ({ page }) => {
    await page.getByTestId('tool-shape').click()
    await page.mouse.move(340, 220)
    await page.mouse.down()
    await page.mouse.move(700, 460, { steps: 10 })
    await page.mouse.up()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('selection-overlay')).toBeVisible()
    atLeast24(await targets(page, '[data-testid^="handle-"]'))
    atLeast24(await targets(page, '.of-connect-point'))
  })

  test("a line's ends, bends and legs", async ({ page }) => {
    await note(page, { x: 280, y: 250 }, 'A')
    await note(page, { x: 780, y: 470 }, 'B')
    await page.keyboard.press('c')
    const from = await canvasPoint(page, { x: 280, y: 250 })
    const to = await canvasPoint(page, { x: 780, y: 470 })
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 8 })
    await page.mouse.up()
    await page.keyboard.press('v')
    await page.locator('.of-connector__line').click({ force: true })
    await expect(page.getByTestId('endpoint-from')).toBeVisible()
    atLeast24(await targets(page, '[data-testid="endpoint-from"], [data-testid="endpoint-to"]'))

    await page.getByTestId('field-routing').selectOption('orthogonal')
    const line = page.locator('.of-connector__line')
    const middle = await line.evaluate((element) => {
      const path = element as unknown as SVGPathElement
      const point = path.getPointAtLength(path.getTotalLength() / 2)
      const matrix = path.getScreenCTM()
      if (matrix === null) throw new Error('off screen')
      const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix)
      return { x: screen.x, y: screen.y }
    })
    await page.mouse.move(middle.x, middle.y)
    await expect(page.locator('[data-testid^="endpoint-leg:"]')).toHaveCount(1)
    atLeast24(await targets(page, '[data-testid^="endpoint-leg:"]'))
  })

  test("a table's dividers", async ({ page }) => {
    await page.getByTestId('tool-table').click()
    await page.locator(CANVAS).click({ position: { x: 340, y: 300 } })
    await page.locator(CANVAS).click({ position: AWAY })
    await expect(page.getByTestId('table-editor')).toHaveCount(0)
    await page.locator('[data-object-type="table"]').click()
    await expect(page.locator('[data-testid^="divider-"]').first()).toBeAttached()
    atLeast24(await targets(page, '[data-testid^="divider-"]'))
  })
})

/*
 * Below about 48px on screen there is no room for eight squares, two
 * families of strip, four connect points and a rotate grip — at 25% a 40px
 * shape was ten pixels across, its handles covered it, and a press in its
 * middle landed on a handle and RESIZED it. A small selection keeps its four
 * corners, outside it, and its middle moves it.
 */
test('a small selection keeps its corners, and its middle moves it', async ({ page }) => {
  await page.getByTestId('tool-shape').click()
  await page.mouse.move(400, 300)
  await page.mouse.down()
  await page.mouse.move(440, 340, { steps: 4 })
  await page.mouse.up()
  await page.keyboard.press('Escape')
  for (let press = 0; press < 2; press += 1) await page.keyboard.press('Control+-')
  await expect(page.getByTestId('zoom-percent')).toHaveText('25%')
  const shape = page.locator('[data-object-type="shape"]')
  await shape.click({ force: true })
  await expect(page.getByTestId('selection-overlay')).toBeVisible()

  await expect(page.locator('[data-testid^="handle-"]')).toHaveCount(4)
  await expect(page.getByTestId('handle-nw')).toBeVisible()
  await expect(page.locator('[data-testid^="edge-"]')).toHaveCount(0)
  await expect(page.getByTestId('handle-rotate')).toHaveCount(0)
  await expect(page.locator('.of-connect-point')).toHaveCount(0)

  const before = await shape.boundingBox()
  if (before === null) throw new Error('no shape')
  const middle = { x: before.x + before.width / 2, y: before.y + before.height / 2 }
  await page.mouse.move(middle.x, middle.y)
  await page.mouse.down()
  await page.mouse.move(middle.x + 60, middle.y + 40, { steps: 6 })
  await page.mouse.up()
  const after = await shape.boundingBox()
  if (after === null) throw new Error('no shape')
  // Moved, not resized.
  expect(after.x - before.x).toBeGreaterThan(40)
  expect(Math.abs(after.width - before.width)).toBeLessThan(1)
  expect(Math.abs(after.height - before.height)).toBeLessThan(1)
})
