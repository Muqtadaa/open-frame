import { expect, type Page } from '@playwright/test'

import { localBoardUrl } from './routes.js'

/**
 * Puts a board in this browser, the way a board gets there.
 *
 * Since 2026-09-19 starting a board takes an account, and this suite has
 * neither an account nor a network to make one with — so the specs that need
 * rows in the ledger address a local board directly. That is not a back door:
 * it is exactly how a board made before that change is reached, and keeping
 * those working is the compatibility promise the account change had to make.
 *
 * The EDIT is load-bearing. Autosave subscribes to the command stream, so a
 * board that is merely opened is never written — the first version of this
 * helper only navigated, and every list it produced was empty.
 */
export async function seedLocalBoard(page: Page, name: string, title?: string): Promise<void> {
  await page.goto(localBoardUrl(name))
  await page.waitForSelector('[data-testid="status-bar"]')

  // A sticky, placed through the real tool: one command, one autosave.
  await page.keyboard.press('s')
  await page.locator('[data-testid="canvas"]').click({ position: { x: 200, y: 200 } })
  await expect(page.locator('[data-object-id]')).toHaveCount(1)

  if (title !== undefined) {
    await page.locator('[data-testid="board-title"]').click()
    await page.locator('[data-testid="board-title-input"]').fill(title)
    await page.locator('[data-testid="board-title-input"]').press('Enter')
  }

  // The exit flushes the pending save before navigating, which is what makes
  // the board certain to be on disk by the time the list is read.
  await page.getByTestId('board-exit').click()
  await page.waitForSelector('[data-testid="home"]')
}
