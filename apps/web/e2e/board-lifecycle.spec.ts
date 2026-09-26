import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * The one end-to-end journey Phase 1 must support:
 *
 *   create -> edit -> move -> reload -> undo
 *
 * It exists to prove the architectural seams actually connect — command layer
 * to store, store to renderer, renderer to persistence, persistence back to the
 * domain — not to cover UI behaviour. Everything else is tested far cheaper at
 * the unit level.
 */

const CANVAS = '[data-testid="canvas"]'
/*
 * Whatever is currently editable in place.
 *
 * Body text is a `contenteditable` since rich text (ADR 0012); a frame's title
 * and an image's alt text are labels and stay plain textareas. A spec should
 * not have to know which it is about to type into.
 */
const EDITOR = 'textarea, [contenteditable="true"]'
const STICKY = '[data-object-type="sticky"]'

async function createSticky(page: Page, x: number, y: number, text: string): Promise<void> {
  await page.getByTestId('tool-sticky').click()
  await page.locator(CANVAS).click({ position: { x, y } })
  const editor = page.locator(EDITOR)
  await expect(editor).toBeFocused()
  await editor.fill(text)
  // Clicking away must COMMIT, not discard — the editor saves on blur.
  await page.locator(CANVAS).click({ position: { x: 700, y: 450 } })
  await expect(page.locator(EDITOR)).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.goto(BOARD_URL)
  // Each test starts from a clean local database.
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('openframe')
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      request.onblocked = () => resolve()
    })
  })
  await page.reload()
  await expect(page.locator(CANVAS)).toBeVisible()
  /*
   * Also wait for the toolbar. A visible canvas only means React rendered;
   * `useKeyboardShortcuts` attaches its listener in an effect, which runs after
   * paint, so a keystroke sent on the canvas alone can land in the gap and be
   * dropped. That showed up as a rare, unexplained tool-selection failure.
   */
  await expect(page.getByTestId("tool-select")).toBeVisible()
})

test('creates a sticky note and shows its text', async ({ page }) => {
  await createSticky(page, 300, 250, 'Customers do not understand pricing')

  await expect(page.locator(STICKY)).toHaveCount(1)
  await expect(page.locator(STICKY)).toContainText('Customers do not understand pricing')
  // The bar says the work is on this device rather than counting it.
  await expect(page.getByTestId('save-state')).toHaveText('Saved')
})

test('persists across a reload', async ({ page }) => {
  await createSticky(page, 300, 250, 'Survives a reload')

  await page.waitForTimeout(800) // autosave is debounced
  await page.reload()

  await expect(page.locator(STICKY)).toHaveCount(1)
  await expect(page.locator(STICKY)).toContainText('Survives a reload')
})

test('drags a note and undoes the move as a single action', async ({ page }) => {
  await createSticky(page, 300, 250, 'Draggable')

  const note = page.locator(STICKY)
  const before = await note.boundingBox()
  expect(before).not.toBeNull()
  if (before === null) return

  // Many pointer events, one undoable action.
  await page.mouse.move(before.x + 40, before.y + 40)
  await page.mouse.down()
  for (let step = 1; step <= 10; step++) {
    await page.mouse.move(before.x + 40 + step * 15, before.y + 40 + step * 8)
  }
  await page.mouse.up()

  const after = await note.boundingBox()
  expect(after).not.toBeNull()
  if (after === null) return
  expect(Math.round(after.x - before.x)).toBeGreaterThan(100)

  await page.getByTestId('undo').click()

  const restored = await note.boundingBox()
  expect(restored).not.toBeNull()
  if (restored === null) return
  expect(Math.round(restored.x)).toBe(Math.round(before.x))

  // One drag produced exactly one history entry, so undo is now exhausted
  // back to creation rather than stepping through hundreds of pointer moves.
  await expect(page.getByTestId('redo')).toBeEnabled()
})

test('selects a note and changes its colour', async ({ page }) => {
  await createSticky(page, 300, 250, 'Colour me')

  await page.locator(STICKY).click()
  await expect(page.locator('.of-object--selected')).toHaveCount(1)

  await page.getByTestId('swatch-blue').click()
  await expect(page.locator('.of-sticky')).toHaveCSS('background-color', 'rgb(207, 226, 255)')
})

test('deletes the selection and restores it with undo', async ({ page }) => {
  await createSticky(page, 300, 250, 'Temporary')

  await page.locator(STICKY).click()
  // Delete lives with the SELECTION now, in the inspector, rather than in the
  // creation rail.
  await page.getByTestId('inspector-delete').click()
  await expect(page.locator(STICKY)).toHaveCount(0)

  await page.getByTestId('undo').click()
  await expect(page.locator(STICKY)).toHaveCount(1)
  await expect(page.locator(STICKY)).toContainText('Temporary')
})

/**
 * The AGPL section 13 offer of source.
 *
 * OpenFrame is network-interactive software under the AGPL, so a hosted
 * modified version must offer its users the source. A test rather than a
 * comment, because this is a licence obligation that would otherwise be quietly
 * lost the first time the status bar is redesigned.
 */
test('offers a link to the source, as the licence requires', async ({ page }) => {
  const link = page.getByTestId('source-link')
  await expect(link).toBeVisible()

  const href = await link.getAttribute('href')
  expect(href).toMatch(/^https:\/\//)
})
