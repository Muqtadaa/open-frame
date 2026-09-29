import { expect, type Browser, type Page } from '@playwright/test'

/**
 * Opening a shared room from a new device.
 *
 * Copied into five specs before it lived here. `live-comments` keeps its own,
 * because it signs somebody in before the room opens.
 */

/** A room nobody else in the run will pick, so specs never share a board. */
export function newRoomId(): string {
  return `brd_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`
}

/**
 * A new context is a new device: no board, no CRDT, nothing stored. Returns
 * once the room reports it is connected, which is the first moment an edit
 * made here can reach anybody else.
 */
export async function join(browser: Browser, room: string): Promise<Page> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`/?room=${room}`)
  await page.waitForSelector('[data-testid="status-bar"]')
  await expect(page.locator('[data-testid="room-status"]')).toHaveAttribute(
    'data-status',
    'connected',
    { timeout: 20_000 },
  )
  return page
}

/**
 * Waits until an edit made after `since` is kept on this device: the board
 * document written (the save state reads `saved`) and the board's CRDT row
 * rewritten after `since`. What a session that closes the tab next needs, and
 * what a fixed sleep before `close()` used to guess at.
 *
 * `since` is the page's own clock, read just BEFORE the edit, so the row it
 * waits for can only be a write queued by the edit or after it.
 */
export async function keptLocally(page: Page, room: string, since: number): Promise<void> {
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved')
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          new Promise<number>((resolve) => {
            const open = indexedDB.open('openframe')
            open.onerror = () => resolve(0)
            open.onsuccess = () => {
              const db = open.result
              const read = db.transaction('crdt', 'readonly').objectStore('crdt').get(id)
              read.onerror = () => resolve(0)
              read.onsuccess = () => {
                const row = read.result as { savedAt?: number } | undefined
                db.close()
                resolve(row?.savedAt ?? 0)
              }
            }
          }),
        room,
      ),
    )
    .toBeGreaterThan(since)
}

/** The page's clock, for `keptLocally`. */
export function pageNow(page: Page): Promise<number> {
  return page.evaluate(() => Date.now())
}
