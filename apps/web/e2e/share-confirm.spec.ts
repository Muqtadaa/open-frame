import { expect, test } from '@playwright/test'

import { BOARD_URL } from './routes.js'
import { signedIn } from './signed-in.js'

/**
 * Sharing a board that lives only in this browser MOVES it, so it asks first.
 *
 * It used to move on the press and show the links over the page it had just
 * left, which went on taking edits and saying "Saved" (C3 #9, P0). The move
 * itself is proved against a real room in `e2e-rooms`; this is the question
 * before it, which needs no server.
 */
test.beforeEach(async ({ page }) => {
  await signedIn(page, [])
  await page.goto(BOARD_URL)
  await page.waitForSelector('[data-testid="status-bar"]')
  await page.getByTestId('board-title').click()
  await page.getByTestId('board-title-input').fill('Still here')
  await page.getByTestId('board-title-input').press('Enter')
})

test('asks before moving, and says what moving does', async ({ page }) => {
  await page.getByTestId('share-board').click()
  const ask = page.getByRole('alertdialog', { name: 'Move this board to share it?' })
  await expect(ask).toBeVisible()
  await expect(ask).toContainText('two links')
  await expect(page.getByTestId('share-confirm')).toBeFocused()
  // The board behind cannot be worked on while the question is open.
  await expect(page.getByTestId('tool-sticky')).not.toBeFocused()
  expect(
    await page.getByTestId('canvas').evaluate((element) => element.closest('[inert]') !== null),
  ).toBe(true)
})

test('Escape or Not now leaves the board where it is', async ({ page }) => {
  await page.getByTestId('share-board').click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('share-dialog')).toHaveCount(0)
  await expect(page.getByTestId('share-board')).toBeFocused()

  await page.getByTestId('share-board').click()
  await page.getByTestId('share-cancel').click()
  await expect(page.getByTestId('share-dialog')).toHaveCount(0)
  await expect(page.getByTestId('board-title')).toHaveText('Still here')
  expect(
    await page.getByTestId('canvas').evaluate((element) => element.closest('[inert]') === null),
  ).toBe(true)
})

/*
 * The test config points the room server at a closed port, so the move
 * fails — and a failed move must leave the board exactly as it was, in words.
 */
test('a move that fails says so and keeps the board', async ({ page }) => {
  await page.getByTestId('share-board').click()
  await page.getByTestId('share-confirm').click()
  await expect(page.getByTestId('share-dialog')).toContainText('could not', { timeout: 20_000 })
  await page.getByTestId('share-cancel').click()
  await expect(page.getByTestId('board-title')).toHaveText('Still here')
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved')
})
