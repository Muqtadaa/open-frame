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
