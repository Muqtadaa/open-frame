import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * The notice (the board opened with something it could not read) and the
 * toast (something just tried did not work).
 *
 * Both were drawn in the danger colours: a board with one note from a newer
 * version looked like a board in trouble. The toast's close glyph rendered at
 * 0px inside an 8×15 target, and a dismissed notice took the keyboard with it.
 */
const CANVAS = '[data-testid="canvas"]'
const FILE_INPUT = 'input[type="file"]'

async function boardWithAnUnknownObject(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await expect(page.getByTestId('tool-select')).toBeVisible()
  await page.keyboard.press('s')
  await expect(page.getByTestId('tool-sticky')).toHaveAttribute('aria-pressed', 'true')
  await page.locator(CANVAS).click({ position: { x: 340, y: 260 } })
  await expect(page.locator('[contenteditable="true"]')).toBeFocused()
  await page.keyboard.type('From the future')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved')
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
    const record = request.result as { payload: { board: { objects: { type: string }[] } } }
    const first = record.payload.board.objects[0]
    if (first !== undefined) first.type = 'kanban-card'
    store.put(record)
    await new Promise((resolve) => {
      transaction.oncomplete = resolve
    })
    db.close()
  })
  await page.reload()
  await expect(page.getByTestId('notice-banner')).toBeVisible()
}

async function rejectAnUpload(page: Page): Promise<void> {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')
  await page
    .locator(FILE_INPUT)
    .setInputFiles({ name: 'not-really.png', mimeType: 'image/png', buffer: svg })
  await expect(page.getByTestId('toast')).toBeVisible()
}

test.describe('the notice', () => {
  test.beforeEach(async ({ page }) => {
    await boardWithAnUnknownObject(page)
  })

  test('is advice, not alarm, and counts in words', async ({ page }) => {
    const notice = page.getByTestId('notice-banner')
    await expect(notice).toHaveAttribute('data-tone', 'advisory')
    await expect(notice).toContainText('1 object could not be read')
    await expect(notice).not.toContainText('(s)')
  })

  test('hands the keyboard on when dismissed, rather than dropping it', async ({ page }) => {
    await page.getByTestId('notice-banner').getByRole('button', { name: 'Dismiss' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('notice-banner')).toHaveCount(0)
    const landed = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY')
    expect(landed).not.toBe('BODY')
  })
})

test.describe('the toast', () => {
  test('has a close you can see and press', async ({ page }) => {
    await page.goto(BOARD_URL)
    await expect(page.getByTestId('tool-select')).toBeVisible()
    await rejectAnUpload(page)
    const close = page.getByTestId('toast').getByRole('button', { name: 'Dismiss' })
    const box = await close.boundingBox()
    const glyph = await close.locator('svg').boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(24)
    expect(box?.height).toBeGreaterThanOrEqual(24)
    expect(glyph?.width).toBeGreaterThan(8)

    await close.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('toast')).toHaveCount(0)
    const landed = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY')
    expect(landed).not.toBe('BODY')
  })

  test('waits while it is being read', async ({ page }) => {
    await page.goto(BOARD_URL)
    await expect(page.getByTestId('tool-select')).toBeVisible()
    await rejectAnUpload(page)
    await page.getByTestId('toast').hover()
    // Longer than it stays up on its own.
    await page.waitForTimeout(5_500)
    await expect(page.getByTestId('toast')).toBeVisible()
  })

  test('stands clear of the notice on a narrow window', async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 800 })
    await boardWithAnUnknownObject(page)
    await rejectAnUpload(page)
    const notice = await page.getByTestId('notice-banner').boundingBox()
    const toast = await page.getByTestId('toast').boundingBox()
    expect(notice).not.toBeNull()
    expect(toast).not.toBeNull()
    if (notice === null || toast === null) return
    expect(toast.y).toBeGreaterThanOrEqual(notice.y + notice.height + 4)
  })
})
