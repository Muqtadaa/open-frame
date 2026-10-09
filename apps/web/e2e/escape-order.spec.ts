import type { Page } from '@playwright/test'

import { buildBoard } from './boards.js'
import { CANVAS, expect, seedBoard, test } from './fixtures.js'

/**
 * One Escape closes the surface opened LAST, and only that one.
 *
 * Every surface that lets go on Escape joins one stack (`controls/
 * escape-stack.ts`). Several read Escape on their own instead, through a
 * window listener of their own or the keydown of their own element. A window
 * listener fires alongside the stack's, so both surfaces closed. An element's
 * keydown fires AFTER the stack's capture-phase listener, so the surface
 * underneath closed and the one on top stayed open with the keyboard gone.
 * Each case here was seen failing first.
 */

const session = (page: Page) => page.getByTestId('session-surface')

/** The session sheet, opened from the board by its key. */
async function openSession(page: Page): Promise<void> {
  await page.keyboard.press('Alt+t')
  await expect(session(page)).toBeVisible()
}

test.describe('with the session sheet open underneath', () => {
  test.use({ board: 'open' })

  test('a rail flyout opened over it is the one Escape closes', async ({ page }) => {
    await page.locator(CANVAS).focus()
    await openSession(page)
    await page.getByTestId('tool-shape').focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('shape-flyout')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('shape-flyout')).toHaveCount(0)
    await expect(session(page)).toBeVisible()
  })

  test('search opened over it is the one Escape closes', async ({ page }) => {
    await page.locator(CANVAS).focus()
    await openSession(page)
    await page.keyboard.press('ControlOrMeta+f')
    await expect(page.getByRole('combobox')).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('combobox')).toHaveCount(0)
    await expect(session(page)).toBeVisible()
  })
})

test('the colour picker is closed before the sheet opened after it', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.note('Note', { x: 340, y: 260 })
    }),
  )
  await page.locator(CANVAS).click({ position: { x: 340, y: 260 } })
  await page.getByTestId('paint-textColor').click()
  await page.getByTestId('ink-custom').click()
  await expect(page.getByTestId('color-picker')).toBeVisible()
  await openSession(page)

  // The sheet came last, so it goes first, and the picker stays.
  await page.keyboard.press('Escape')
  await expect(session(page)).toHaveCount(0)
  await expect(page.getByTestId('color-picker')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('color-picker')).toHaveCount(0)
})
