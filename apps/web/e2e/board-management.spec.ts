import { expect, test, type Page } from '@playwright/test'

import { HOME_URL } from './routes.js'

/**
 * Managing boards from the list, which until now you could not do at all.
 *
 * `deleteBoard` had been on the repository port and implemented in BOTH
 * adapters since Phase 1 with nothing anywhere calling it — rule 21's failure
 * mode, already shipped: a capability nothing in the interface consumes is
 * untested, whatever the port says.
 *
 * These run signed out, so every board here is local. The verbs are the same
 * either way; what differs is whether the row and the room go too, and that is
 * covered where it can be: `board-lifecycle.test.ts` for the order, the rooms
 * suite for the room.
 */

const CANVAS = '[data-testid="canvas"]'

async function startBoards(page: Page, count: number): Promise<void> {
  for (let n = 0; n < count; n += 1) {
    await page.goto(HOME_URL)
    await page.getByTestId('home-start').click()
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 15_000 })
  }
  await page.goto(HOME_URL)
  await expect(page.getByTestId('home-boards').locator('li')).toHaveCount(count)
}

test.describe('renaming', () => {
  test('renames in place, and the new name survives a reload', async ({ page }) => {
    await startBoards(page, 1)

    await page.getByTestId('rename-board').click()
    await page.getByTestId('rename-input').fill('Pricing research')
    await page.getByTestId('rename-input').press('Enter')

    await expect(page.getByTestId('home-boards')).toContainText('Pricing research')

    await page.reload()
    // The title in the list is a COPY of the document's. A rename that only
    // changed the row would be undone the moment the board was opened.
    await expect(page.getByTestId('home-boards')).toContainText('Pricing research')
  })

  test('puts the old name back when the edit is abandoned', async ({ page }) => {
    await startBoards(page, 1)

    await page.getByTestId('rename-board').click()
    await page.getByTestId('rename-input').fill('Never committed')
    await page.getByTestId('rename-input').press('Escape')

    await expect(page.getByTestId('home-boards')).toContainText('Untitled board')
    await expect(page.getByTestId('home-boards')).not.toContainText('Never committed')
  })
})

test.describe('deleting', () => {
  /**
   * A destructive act is confirmed, and the confirmation names what it is
   * about — it appears in the row rather than in a dialog somebody has to
   * remember the subject of.
   */
  test('asks before destroying anything', async ({ page }) => {
    await startBoards(page, 1)

    await page.getByTestId('delete-board').click()
    await expect(page.getByTestId('confirm-remove')).toBeVisible()
    // Nothing has happened yet, and that is the point.
    await expect(page.getByTestId('home-boards').locator('li')).toHaveCount(1)

    await page.getByTestId('confirm-no').click()
    await expect(page.getByTestId('confirm-remove')).toHaveCount(0)
    await expect(page.getByTestId('home-boards').locator('li')).toHaveCount(1)
  })

  test('removes the board, and it stays removed', async ({ page }) => {
    await startBoards(page, 2)

    await page.getByTestId('delete-board').first().click()
    await page.getByTestId('confirm-yes').click()

    await expect(page.getByTestId('home-boards').locator('li')).toHaveCount(1)

    await page.reload()
    await expect(page.getByTestId('home-boards').locator('li')).toHaveCount(1)
  })

  /** A local board has nobody else on it, so there is nothing to leave. */
  test('offers no way to leave a board that is only yours', async ({ page }) => {
    await startBoards(page, 1)

    await expect(page.getByTestId('leave-board')).toHaveCount(0)
    await expect(page.getByTestId('delete-board')).toHaveCount(1)
  })
})

test.describe('pinning', () => {
  /**
   * The assertion that matters: a pin must beat recency, and the fixture is
   * built so that it has to. The pinned board is the one started FIRST, so it
   * is the one recency would put last — a test that pinned the newest board
   * would pass with pinning deleted.
   */
  test('lifts a board above more recent ones and holds it there', async ({ page }) => {
    await startBoards(page, 3)

    const rows = page.getByTestId('home-boards').locator('li')
    // Name them so order is readable rather than inferred from ids.
    for (const [index, name] of ['newest', 'middle', 'oldest'].entries()) {
      await rows.nth(index).getByTestId('rename-board').click()
      await page.getByTestId('rename-input').fill(name)
      await page.getByTestId('rename-input').press('Enter')
      await expect(rows.nth(index)).toContainText(name)
    }

    await expect(rows.nth(2)).toContainText('oldest')

    await rows.nth(2).getByTestId('pin-board').click()

    await expect(rows.nth(0)).toContainText('oldest')
    await expect(rows.nth(0)).toHaveAttribute('data-pinned', 'yes')

    await page.reload()
    await expect(rows.nth(0)).toContainText('oldest')
  })

  test('unpins back to where it belongs', async ({ page }) => {
    await startBoards(page, 2)

    const rows = page.getByTestId('home-boards').locator('li')
    await rows.nth(1).getByTestId('rename-board').click()
    await page.getByTestId('rename-input').fill('older')
    await page.getByTestId('rename-input').press('Enter')

    await rows.nth(1).getByTestId('pin-board').click()
    await expect(rows.nth(0)).toContainText('older')

    await rows.nth(0).getByTestId('pin-board').click()
    await expect(rows.nth(1)).toContainText('older')
  })
})
