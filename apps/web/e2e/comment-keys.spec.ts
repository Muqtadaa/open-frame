import { expect, test, type Page } from '@playwright/test'

import { signedIn } from './signed-in.js'

/**
 * The comment tool's keyboard, and the panel it opens.
 *
 * A comment is prose, so plain Enter is a NEW LINE and committing takes a
 * modifier — the opposite of a table cell, which holds one short value and
 * commits on Enter.
 */
const BOARD = 'brd_abcdefgh12345678'
const KEY = 'e'.repeat(32)

async function openBoard(page: Page): Promise<void> {
  await page.routeWebSocket(/\/room\//, () => undefined)
  await page.goto(`/?room=${BOARD}&k=${KEY}`)
  await page.waitForSelector('[data-testid="status-bar"]')
}

test('opens the comments panel when the tool is chosen', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
  await openBoard(page)

  // Nothing before the tool is picked.
  await expect(page.getByTestId('comment-panel')).toHaveCount(0)

  await page.getByTestId('tool-comment').click()
  await expect(page.getByTestId('comment-panel')).toBeVisible()
  await expect(page.getByTestId('comment-list-empty')).toBeVisible()

  /*
   * Closing STICKS. A panel that came back every time the mode changed would
   * be one you cannot put away.
   */
  await page.getByTestId('comment-close').click()
  await expect(page.getByTestId('comment-panel')).toHaveCount(0)
  await page.keyboard.press('v')
  await expect(page.getByTestId('comment-panel')).toHaveCount(0)

  // Until the tool is chosen again, which is a fresh request to see them.
  await page.getByTestId('tool-comment').click()
  await expect(page.getByTestId('comment-panel')).toBeVisible()
})

test('posts on Cmd or Ctrl and Enter, and keeps plain Enter for a new line', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
  await openBoard(page)

  await page.getByTestId('tool-comment').click()
  await page.locator('[data-testid="canvas"]').click({ position: { x: 320, y: 240 } })

  const input = page.getByTestId('comment-input')
  await input.fill('first line')
  await input.press('Enter')
  // Still composing: a comment is prose, and Enter is how prose gets a line.
  await expect(page.getByTestId('comment-panel')).toBeVisible()
  await expect(page.locator('[data-testid^="comment-pin-cmt_"]')).toHaveCount(0)

  await input.press('ControlOrMeta+Enter')
  await expect(page.locator('[data-testid^="comment-pin-cmt_"]')).toHaveCount(1)
})

test('abandons a comment on Escape', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
  await openBoard(page)

  await page.getByTestId('tool-comment').click()
  await page.locator('[data-testid="canvas"]').click({ position: { x: 320, y: 240 } })
  await page.getByTestId('comment-input').fill('never mind')
  await page.getByTestId('comment-input').press('Escape')

  // Gone, and nothing was written.
  await expect(page.getByTestId('comment-panel')).toHaveCount(0)
  await expect(page.locator('[data-testid^="comment-pin-cmt_"]')).toHaveCount(0)
})
