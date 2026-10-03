import type { Page } from '@playwright/test'

import { CANVAS, expect, saved, seedBoard, test, undo } from './fixtures.js'
import { buildBoard } from './boards.js'

test.use({ board: 'fresh' })

/**
 * Reactions on a note: one person's 👍, ❤️ or ❓, left on it and taken back.
 *
 * Each reaction is an object of its own, so the note itself never changes —
 * which is what lets two people react at the same moment without one of them
 * losing theirs (the rooms suite covers that).
 */
const NOTE = { x: 400, y: 300 }

async function oneNote(page: Page): Promise<void> {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.note('Hide the price until checkout', NOTE)
    }),
  )
}

const chip = (page: Page, glyph: string) => page.getByTestId(`reaction-${glyph}`)

test('reacts from the bar beside a selected note, and takes it back', async ({ page }) => {
  await oneNote(page)
  await page.locator(CANVAS).click({ position: NOTE })

  const bar = page.getByTestId('reaction-bar')
  await bar.getByRole('button', { name: 'Agree' }).click()

  await expect(chip(page, 'plus-one')).toHaveText(/1/)
  await expect(chip(page, 'plus-one')).toHaveAttribute('aria-pressed', 'true')
  await expect(bar.getByRole('button', { name: 'Agree' })).toHaveAttribute('aria-pressed', 'true')

  // The chip itself is a toggle for your own reaction.
  await chip(page, 'plus-one').click()
  await expect(chip(page, 'plus-one')).toHaveCount(0)
})

test('reacts from the keyboard, through the context menu', async ({ page }) => {
  await oneNote(page)
  await page.locator(CANVAS).click({ position: NOTE })
  await page.keyboard.press('Shift+F10')
  await page.getByRole('menuitem', { name: 'React' }).press('ArrowRight')
  await page.getByRole('menuitem', { name: /Good idea/ }).press('Enter')

  await expect(chip(page, 'idea')).toHaveText(/1/)
})

test('is one undo step, and survives a reload', async ({ page }) => {
  await oneNote(page)
  await page.locator(CANVAS).click({ position: NOTE })
  await page.getByTestId('reaction-bar').getByRole('button', { name: 'Love it' }).click()
  await expect(chip(page, 'heart')).toHaveCount(1)

  await undo(page)
  await expect(chip(page, 'heart')).toHaveCount(0)

  await page.getByTestId('reaction-bar').getByRole('button', { name: 'Love it' }).click()
  await saved(page)
  await page.reload()
  await expect(chip(page, 'heart')).toHaveText(/1/)
})

/*
 * A reaction to nothing is not a reaction, so it goes with its note — and
 * comes back with it, because both happen in one command.
 */
test('goes with its note when the note is deleted, and comes back on undo', async ({ page }) => {
  await oneNote(page)
  await page.locator(CANVAS).click({ position: NOTE })
  await page.getByTestId('reaction-bar').getByRole('button', { name: 'Question' }).click()
  await expect(chip(page, 'question')).toHaveCount(1)

  await page.locator(CANVAS).click({ position: NOTE })
  await page.keyboard.press('Delete')
  await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(0)

  await undo(page)
  await expect(chip(page, 'question')).toHaveText(/1/)
})

/*
 * A chip sits inside its note's bounds, so a double-click on it was read by the
 * board as a double-click on the note and opened it for typing.
 */
test('double-clicking a reaction does not open the note', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      const note = board.note('Hide the price until checkout', NOTE)
      // Somebody else's, so the chip stays while ours comes and goes.
      board.react(note, 'plus-one', { key: 'g_0123456789abcdef', name: 'Heron', hue: 200 })
    }),
  )
  const before = await page.locator('[data-object-type="sticky"]').boundingBox()
  await chip(page, 'plus-one').dblclick()
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(0)
  // Two presses: ours on, then off again.
  await expect(chip(page, 'plus-one')).toHaveText(/1/)
  expect(await page.locator('[data-object-type="sticky"]').boundingBox()).toEqual(before)
})
