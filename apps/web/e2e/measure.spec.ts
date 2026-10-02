import type { Page } from '@playwright/test'

import { boxOf, CANVAS, expect, seedBoard, test } from './fixtures.js'
import { buildBoard } from './boards.js'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

test.use({ board: 'fresh' })

/**
 * Measuring on purpose, as in a design tool: select something, hold Alt, point
 * at something else, and the board says how far apart they are and where they
 * line up. With several things selected and nothing else pointed at, it says
 * the gaps between them.
 *
 * The board only said how far apart two things were while one was being
 * dragged into line with the other, so checking a layout meant moving it.
 */
const A = { x: 320, y: 300 }
const B = { x: 620, y: 300 }
const C = { x: 920, y: 300 }

async function notes(page: Page, ...at: { x: number; y: number }[]): Promise<void> {
  await seedBoard(
    page,
    buildBoard((board) => {
      at.forEach((point, i) => board.note(`Note ${String(i + 1)}`, point))
    }),
  )
}

const note = (page: Page, i: number) => page.locator('[data-object-type="sticky"]').nth(i)

test('says how far the selection is from what Alt points at, and goes when Alt is let go', async ({
  page,
}) => {
  await notes(page, A, B)
  const a = await boxOf(note(page, 0))
  const b = await boxOf(note(page, 1))
  await page.locator(CANVAS).click({ position: A })

  await page.mouse.move(B.x, B.y)
  await page.keyboard.down('Alt')
  await page.mouse.move(B.x + 4, B.y + 4)

  const gap = page.getByTestId('measure-gap-x')
  await expect(gap).toHaveCount(1)
  // At 100%, a screen pixel is a board unit.
  await expect(gap).toHaveText(String(Math.round(b.x - (a.x + a.width))))
  // Same size, same row: top, middle and bottom all line up.
  await expect(page.getByTestId('measure-match-y')).toHaveCount(3)

  await page.keyboard.up('Alt')
  await expect(gap).toHaveCount(0)
  await expect(page.getByTestId('measure-match-y')).toHaveCount(0)
})

test('says nothing with nothing selected', async ({ page }) => {
  await notes(page, A, B)
  await page.mouse.move(B.x, B.y)
  await page.keyboard.down('Alt')
  await page.mouse.move(B.x + 4, B.y + 4)
  await expect(page.getByTestId('measure-gap-x')).toHaveCount(0)
  await page.keyboard.up('Alt')
})

test('says the gaps between the things selected when nothing else is pointed at', async ({
  page,
}) => {
  await notes(page, A, B, C)
  await page.keyboard.press(`${MOD}+a`)
  await page.mouse.move(640, 600)
  await page.keyboard.down('Alt')
  await page.mouse.move(644, 604)

  const gaps = page.getByTestId('measure-gap-x')
  await expect(gaps).toHaveCount(2)
  const a = await boxOf(note(page, 0))
  const b = await boxOf(note(page, 1))
  await expect(gaps.first()).toHaveText(String(Math.round(b.x - (a.x + a.width))))
  await page.keyboard.up('Alt')
})

/*
 * Pointing at a note and then leaving the board — for the bar, say — left that
 * note recorded as under the pointer, and Alt went on measuring to it.
 */
test('measures to nothing once the pointer has left the board', async ({ page }) => {
  await notes(page, A, B)
  await page.locator(CANVAS).click({ position: A })
  await page.mouse.move(B.x, B.y)
  await page.keyboard.down('Alt')
  await page.mouse.move(B.x + 4, B.y + 4)
  await expect(page.getByTestId('measure-gap-x')).toHaveCount(1)
  await page.keyboard.up('Alt')

  // Out of the window, which is the only way off this board: the browser says
  // so with a pointerout that has nowhere to go to.
  await page.locator(CANVAS).dispatchEvent('pointerout', {
    bubbles: true,
    relatedTarget: null,
    pointerType: 'mouse',
  })
  await page.keyboard.down('Alt')
  await expect(page.getByTestId('measure-match-y')).toHaveCount(0)
  await expect(page.getByTestId('measure-gap-x')).toHaveCount(0)
  await page.keyboard.up('Alt')
})

test('stops measuring when the window loses the key', async ({ page }) => {
  await notes(page, A, B)
  await page.locator(CANVAS).click({ position: A })
  await page.mouse.move(B.x, B.y)
  await page.keyboard.down('Alt')
  await page.mouse.move(B.x + 4, B.y + 4)
  await expect(page.getByTestId('measure-gap-x')).toHaveCount(1)

  // Alt-Tab: the key goes up in another window, and this one only hears blur.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(page.getByTestId('measure-gap-x')).toHaveCount(0)
  await page.keyboard.up('Alt')
})

test('moves with Alt and an arrow, so it can be nudged while measuring', async ({ page }) => {
  await notes(page, A)
  await page.locator(CANVAS).click({ position: A })
  const before = await boxOf(note(page, 0))
  await page.keyboard.press('Alt+ArrowRight')
  await expect.poll(async () => (await boxOf(note(page, 0))).x).toBeGreaterThan(before.x)
  expect((await boxOf(note(page, 0))).width).toBe(before.width)
})
