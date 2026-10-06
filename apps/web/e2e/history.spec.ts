import { expect, test, type Page } from '@playwright/test'

import { place } from './fixtures.js'
import { BOARD_URL } from './routes.js'

/**
 * A local board's history, kept in this browser (ADR 0019).
 *
 * When a version is due is unit-tested in core and in `local-history.test.ts`.
 * This is the page doing it: an edit, two minutes of quiet on the page's own
 * clock, and a version in IndexedDB.
 */

/** Two minutes of quiet, and a second over: when a version is due. */
const SETTLE = 121_000

/** The keys of this board's versions in IndexedDB, as the browser holds them. */
function versionKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const board = (window as unknown as { __openframe: { runtime: { boardId: string } } })
          .__openframe.runtime.boardId
        const open = indexedDB.open('openframe')
        open.onerror = () => reject(open.error ?? new Error('could not open the database'))
        open.onsuccess = () => {
          const db = open.result
          const read = db.transaction('versions', 'readonly').objectStore('versions').getAllKeys()
          read.onerror = () => reject(read.error ?? new Error('could not read the versions'))
          read.onsuccess = () => {
            db.close()
            resolve(read.result.map(String).filter((key) => key.startsWith(`${board}|`)))
          }
        }
      }),
  )
}

test('a local board keeps a version once editing settles', async ({ page }) => {
  await page.clock.install()
  await page.goto(BOARD_URL)
  await page.waitForSelector('[data-testid="status-bar"]')
  expect(await versionKeys(page)).toEqual([])

  await place(page, 's', { x: 500, y: 400 }, 'Kept for later')
  // Not yet: editing has to have been quiet for two minutes.
  await page.clock.runFor(60_000)
  expect(await versionKeys(page)).toEqual([])

  await page.clock.runFor(61_000)
  await expect.poll(() => versionKeys(page)).toHaveLength(1)
  expect((await versionKeys(page))[0]).toMatch(/\|a$/)
})

/*
 * The history panel (ADR 0019): an earlier version is shown on the canvas,
 * read-only, and an editor can put the board back to it — as one undo entry,
 * with the board as it was just before kept as a version too.
 */
test.describe('looking back, and restoring', () => {
  async function boardWithAVersion(page: Page): Promise<void> {
    await page.clock.install()
    await page.goto(BOARD_URL)
    await page.waitForSelector('[data-testid="status-bar"]')
    await place(page, 's', { x: 400, y: 380 }, 'Kept for later')
    await page.clock.runFor(SETTLE)
    await expect.poll(() => versionKeys(page)).toHaveLength(1)
    await place(page, 's', { x: 700, y: 380 }, 'Written since')
  }

  const canvas = (page: Page) => page.getByTestId('canvas')

  async function openFirstVersion(page: Page): Promise<void> {
    await page.getByTestId('history-button').click()
    await page.getByTestId('history-version').first().click()
    await expect(page.getByTestId('version-preview')).toBeVisible()
  }

  test('shows the version on the canvas, and goes back to now unchanged', async ({ page }) => {
    await boardWithAVersion(page)
    await openFirstVersion(page)
    await expect(canvas(page)).toContainText('Kept for later')
    await expect(canvas(page)).not.toContainText('Written since')
    // Nothing on it can be changed: it is a picture of the past.
    await expect(page.getByTestId('tool-sticky')).toHaveCount(0)

    await page.getByTestId('version-back').click()
    await expect(page.getByTestId('version-preview')).toHaveCount(0)
    await expect(canvas(page)).toContainText('Written since')
  })

  test(
    'restores it, keeps what it replaced, and undo brings that back',
    {
      tag: '@smoke',
    },
    async ({ page }) => {
      await boardWithAVersion(page)
      await openFirstVersion(page)
      await page.getByTestId('version-restore').click()

      await expect(page.getByTestId('version-preview')).toHaveCount(0)
      await expect(canvas(page)).toContainText('Kept for later')
      await expect(canvas(page)).not.toContainText('Written since')
      // The board as it was before the restore is a version of its own now.
      await expect.poll(() => versionKeys(page)).toHaveLength(2)

      await page.keyboard.press('ControlOrMeta+z')
      await expect(canvas(page)).toContainText('Written since')
    },
  )
})
