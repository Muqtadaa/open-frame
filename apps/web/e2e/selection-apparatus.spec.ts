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

/*
 * The board without a pointer (C3 #7). Objects could not be reached from the
 * keyboard at all, the only thing a key could do to a selection was nudge it,
 * the lock key was handled and never bound, and nothing was ever announced.
 */
test.describe('the board from the keyboard', () => {
  const announcer = (page: Page) => page.getByTestId('board-announcer')

  test('Tab reaches the board, walks its objects in reading order, and lets go', async ({
    page,
  }) => {
    await note(page, { x: 600, y: 260 }, 'Second')
    await note(page, { x: 300, y: 260 }, 'First')
    await note(page, { x: 300, y: 480 }, 'Third')
    await page.keyboard.press('Escape')

    // From the top of the page, the board is a stop in the order.
    await page.locator('body').focus()
    let reached = false
    for (let press = 0; press < 60 && !reached; press += 1) {
      await page.keyboard.press('Tab')
      reached = await page.evaluate(
        () => document.activeElement?.getAttribute('data-testid') === 'canvas',
      )
    }
    expect(reached).toBe(true)
    await expect(page.locator(CANVAS)).toHaveAttribute(
      'aria-description',
      /Tab moves between objects/,
    )

    const selected = page.locator('.of-object--selected')
    await page.keyboard.press('Tab')
    await expect(selected).toContainText('First')
    await expect(announcer(page)).toContainText('First')
    await page.keyboard.press('Tab')
    await expect(selected).toContainText('Second')
    await page.keyboard.press('Tab')
    await expect(selected).toContainText('Third')
    await page.keyboard.press('Shift+Tab')
    await expect(selected).toContainText('Second')
    await page.keyboard.press('Tab')

    // Past the last one, Tab leaves the board rather than trapping the keyboard.
    await page.keyboard.press('Tab')
    const left = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') !== 'canvas',
    )
    expect(left).toBe(true)
  })

  test('Alt with an arrow resizes, and says the new size', async ({ page }) => {
    await note(page, { x: 340, y: 260 }, 'Grow')
    const object = page.locator('[data-object-type="sticky"]')
    await object.click()
    const before = await object.boundingBox()
    await page.keyboard.press('Alt+ArrowRight')
    await page.keyboard.press('Alt+ArrowDown')
    await page.keyboard.press('Alt+ArrowDown')
    const after = await object.boundingBox()
    if (before === null || after === null) throw new Error('no note')
    expect(Math.round(after.width - before.width)).toBe(10)
    expect(Math.round(after.height - before.height)).toBe(20)
    await expect(announcer(page)).toHaveText(/^Width \d+, height \d+$/)

    // One undo per press, like a nudge.
    await page.keyboard.press('ControlOrMeta+z')
    const undone = await object.boundingBox()
    expect(Math.round((undone?.height ?? 0) - before.height)).toBe(10)
  })

  test('period and comma rotate, and say the angle', async ({ page }) => {
    await page.getByTestId('tool-shape').click()
    await page.mouse.move(340, 220)
    await page.mouse.down()
    await page.mouse.move(540, 360, { steps: 6 })
    await page.mouse.up()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('selection-overlay')).toBeVisible()

    await page.keyboard.press('.')
    await expect(announcer(page)).toHaveText('Rotated to 15 degrees')
    await page.keyboard.press('.')
    await page.keyboard.press('Shift+<')
    await expect(announcer(page)).toHaveText('Rotated to 29 degrees')
    await page.keyboard.press(',')
    await expect(announcer(page)).toHaveText('Rotated to 14 degrees')
    const transform = await page
      .getByTestId('selection-overlay')
      .evaluate((element) => (element as HTMLElement).style.transform)
    expect(transform).toMatch(/rotate\(0\.24\d*rad\)/)
  })

  test('Mod+Shift+L locks and unlocks, and says which', async ({ page }) => {
    await note(page, { x: 340, y: 260 }, 'Keep')
    await page.locator('[data-object-type="sticky"]').click()
    await page.keyboard.press('ControlOrMeta+Shift+L')
    await expect(page.getByTestId('selection-lock')).toBeVisible()
    await expect(announcer(page)).toHaveText('Locked')
    await page.keyboard.press('ControlOrMeta+Shift+L')
    await expect(page.getByTestId('selection-lock')).toHaveCount(0)
    await expect(announcer(page)).toHaveText('Unlocked')
  })
})

/*
 * Escape is the "never mind" key. Mid-drag it cleared the selection and the
 * move still committed on release; in crop mode one press both left the crop
 * AND let go of the picture.
 */
test.describe('Escape backs out one step at a time', () => {
  test('mid-drag it puts the object back and keeps it selected', async ({ page }) => {
    await note(page, { x: 340, y: 260 }, 'Stay')
    const object = page.locator('[data-object-type="sticky"]')
    await object.click()
    const start = await object.boundingBox()
    if (start === null) throw new Error('no note')
    const from = { x: start.x + start.width / 2, y: start.y + start.height / 2 }
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 120, from.y + 80, { steps: 6 })
    await page.keyboard.press('Escape')
    await page.mouse.move(from.x + 160, from.y + 100, { steps: 3 })
    await page.mouse.up()

    const end = await object.boundingBox()
    expect(Math.abs((end?.x ?? 0) - start.x)).toBeLessThan(1)
    expect(Math.abs((end?.y ?? 0) - start.y)).toBeLessThan(1)
    await expect(page.getByTestId('selection-overlay')).toBeVisible()
  })
})

/*
 * What a selection says about itself. A group was a bare box; the padlock
 * explained the missing handles but could not be pressed, and its tip never
 * showed; members of a multi-selection looked like bystanders; and a resize
 * or a turn said nothing about the size or angle it was reaching for.
 */
test.describe('a selection says what it is', () => {
  test('the padlock unlocks what it is on', async ({ page }) => {
    await note(page, { x: 340, y: 260 }, 'Held')
    await page.locator('[data-object-type="sticky"]').click()
    await page.keyboard.press('ControlOrMeta+Shift+L')
    const lock = page.getByRole('button', { name: 'Unlock' })
    await expect(lock).toBeVisible()
    const box = await lock.boundingBox()
    expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(24)
    await lock.click()
    await expect(page.getByTestId('selection-lock')).toHaveCount(0)
    await expect(page.getByTestId('handle-se')).toBeVisible()
  })

  test('a group says it is one, and how many it holds', async ({ page }) => {
    await note(page, { x: 300, y: 260 }, 'One')
    await note(page, { x: 600, y: 260 }, 'Two')
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('ControlOrMeta+g')
    await expect(page.getByTestId('selection-group')).toHaveText('Group of 2')
  })

  test('each member of a multi-selection is marked', async ({ page }) => {
    await note(page, { x: 300, y: 260 }, 'One')
    await note(page, { x: 600, y: 260 }, 'Two')
    await page.keyboard.press('ControlOrMeta+a')
    await expect(page.locator('.of-selection__member')).toHaveCount(2)
  })

  test('a resize shows the size it is reaching for, and a turn its angle', async ({ page }) => {
    await page.getByTestId('tool-shape').click()
    await page.mouse.move(340, 220)
    await page.mouse.down()
    await page.mouse.move(540, 360, { steps: 6 })
    await page.mouse.up()
    await page.keyboard.press('Escape')

    const corner = await page.getByTestId('handle-se').boundingBox()
    if (corner === null) throw new Error('no handle')
    await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2)
    await page.mouse.down()
    await page.mouse.move(corner.x + 60, corner.y + 40, { steps: 5 })
    await expect(page.getByTestId('selection-readout')).toHaveText(/^\d+ × \d+$/)
    await page.mouse.up()
    await expect(page.getByTestId('selection-readout')).toHaveCount(0)

    const grip = await page.getByTestId('handle-rotate').boundingBox()
    if (grip === null) throw new Error('no grip')
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip.x + 120, grip.y + 60, { steps: 6 })
    await expect(page.getByTestId('selection-readout')).toHaveText(/^-?\d+°$/)
    await page.mouse.up()
  })
})
