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
