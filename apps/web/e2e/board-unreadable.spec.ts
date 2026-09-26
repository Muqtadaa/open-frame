import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * A board this build cannot read (rule 7).
 *
 * It used to open as an EMPTY board — the ground, every tool, nothing on it —
 * with "could not be opened (newer-schema)" above. To somebody who had spent a
 * week on that board, that is a picture of their work being gone. The work is
 * not gone, and what they need to hear is that first.
 */
const CANVAS = '[data-testid="canvas"]'

async function boardWithNotes(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await expect(page.getByTestId('tool-select')).toBeVisible()
  for (const [x, y, text] of [
    [340, 260, 'Pricing page confuses'],
    [640, 420, 'P07 gave up at checkout'],
  ] as const) {
    await page.keyboard.press('s')
    await expect(page.getByTestId('tool-sticky')).toHaveAttribute('aria-pressed', 'true')
    await page.locator(CANVAS).click({ position: { x, y } })
    await expect(page.locator('[contenteditable="true"]')).toBeFocused()
    await page.keyboard.type(text)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
  }
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved')
}

/** The stored record, exactly as IndexedDB holds it. */
function storedRecord(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('openframe')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('open failed'))
    })
    const request = db.transaction('boards').objectStore('boards').get('board_local')
    const record: unknown = await new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result)
    })
    db.close()
    return JSON.stringify(record)
  })
}

/** Marks the stored board as written by a later version, then reopens it. */
async function fromTheFuture(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('openframe')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('open failed'))
    })
    const transaction = db.transaction('boards', 'readwrite')
    const store = transaction.objectStore('boards')
    const request = store.get('board_local')
    await new Promise((resolve) => {
      request.onsuccess = resolve
    })
    const record = request.result as { payload: { schemaVersion: number } }
    record.payload.schemaVersion = 999
    store.put(record)
    await new Promise((resolve) => {
      transaction.oncomplete = resolve
    })
    db.close()
  })
  await page.reload()
}

test.beforeEach(async ({ page }) => {
  await boardWithNotes(page)
  await fromTheFuture(page)
})

test('says the board is safe, whose it is and why it will not open', async ({ page }) => {
  const sheet = page.getByRole('dialog', { name: 'Your board is safe' })
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('a newer version of OpenFrame')
  await expect(sheet).toContainText('2 objects')
  // No codes: "newer-schema" is the program talking to itself.
  await expect(sheet).not.toContainText('newer-schema')
  await expect(page.getByTestId('notice-banner')).toHaveCount(0)
})

test('offers no tools for a board nothing can be done to', async ({ page }) => {
  await expect(page.getByTestId('board-unreadable')).toBeVisible()
  await expect(page.getByTestId('tool-sticky')).toHaveCount(0)
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'read-only')
})

test('cannot be dismissed, and its way out is All boards', async ({ page }) => {
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('board-unreadable')).toBeVisible()
  await expect(page.getByTestId('board-unreadable-exit')).toHaveAttribute('href', '/')
})

test('hands over the stored board exactly as it is', async ({ page }) => {
  const stored = await storedRecord(page)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download a copy' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/\.openframe\.json$/)
  const path = await download.path()
  const { readFile } = await import('node:fs/promises')
  const written = JSON.parse(await readFile(path, 'utf8')) as unknown
  expect(written).toEqual((JSON.parse(stored) as { payload: unknown }).payload)
})

test('is never written back, whatever happens on the page', async ({ page }) => {
  const before = await storedRecord(page)
  await page.keyboard.press('s')
  await page.mouse.dblclick(400, 400)
  await page.keyboard.type('anything')
  await page.keyboard.press('Control+z')
  await page.reload()
  await expect(page.getByTestId('board-unreadable')).toBeVisible()
  expect(await storedRecord(page)).toBe(before)
})
