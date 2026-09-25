import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * Escape ends an edit; it does not throw the edit away.
 *
 * It used to. A note somebody had just written went back to what it said
 * before — silently, with nothing on the undo stack to bring it back — which is
 * the one failure PRODUCT.md calls unacceptable, reached by the key people
 * press to mean "I'm done". Every editor on the board now treats Escape as
 * leaving, and leaving commits; undo is how an edit is taken back.
 */
const CANVAS = '[data-testid="canvas"]'
const EDITOR = '[contenteditable="true"]'
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function board(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await expect(page.locator(CANVAS)).toBeVisible()
  await expect(page.getByTestId('tool-select')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await board(page)
})

test('keeps what was typed into a new note, as one undoable edit', async ({ page }) => {
  await page.keyboard.press('s')
  await page.locator(CANVAS).click({ position: { x: 340, y: 260 } })
  await expect(page.locator(EDITOR)).toBeFocused()
  await page.keyboard.type('Customers churn in week two')
  await page.keyboard.press('Escape')

  await expect(page.locator(EDITOR)).toHaveCount(0)
  const note = page.locator('[data-object-type="sticky"]')
  await expect(note).toHaveCount(1)
  await expect(note).toContainText('Customers churn in week two')

  // Undo takes the words back and leaves the note — the edit is the entry.
  await page.keyboard.press(`${MOD}+z`)
  await expect(note).toHaveCount(1)
  await expect(note).not.toContainText('Customers')
})

test('keeps a rewrite of an existing note', async ({ page }) => {
  await page.keyboard.press('s')
  await page.locator(CANVAS).click({ position: { x: 340, y: 260 } })
  await page.keyboard.type('First draft')
  await page.locator(CANVAS).click({ position: { x: 1100, y: 640 } })

  await page.locator('[data-object-type="sticky"]').dblclick()
  await expect(page.locator(EDITOR)).toBeFocused()
  await page.keyboard.press(`${MOD}+a`)
  await page.keyboard.type('Second draft')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-object-type="sticky"]')).toContainText('Second draft')
})

test('keeps a shape label', async ({ page }) => {
  await page.keyboard.press('u')
  await page.locator(CANVAS).click({ position: { x: 340, y: 200 } })
  await page.keyboard.type('Box')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-object-type="shape"]')).toContainText('Box')
})

test('keeps a frame name', async ({ page }) => {
  await page.keyboard.press('f')
  await page.locator(CANVAS).click({ position: { x: 500, y: 350 } })
  await expect(page.locator(EDITOR)).toBeFocused()
  await page.keyboard.press(`${MOD}+a`)
  await page.keyboard.type('Discovery')
  await page.keyboard.press('Escape')
  await expect(page.locator('.of-frame__title')).toContainText('Discovery')
})

test('keeps code', async ({ page }) => {
  await page.keyboard.press('k')
  await page.locator(CANVAS).click({ position: { x: 340, y: 260 } })
  await page.locator('[data-object-id]').first().dblclick()
  await page.getByTestId('code-input').fill('const kept = true')
  await page.getByTestId('code-input').press('Escape')
  await expect(page.getByTestId('code-input')).toHaveCount(0)
  await expect(page.getByTestId('code-block')).toContainText('const kept = true')
})

test('keeps a table cell, and a second Escape leaves the table with it', async ({ page }) => {
  await page.getByTestId('tool-table').click()
  await page.locator(CANVAS).click({ position: { x: 340, y: 300 } })
  const editor = page.getByTestId('table-editor')
  await expect(editor).toHaveAttribute('data-mode', 'navigate')
  await page.keyboard.type('kept')
  await page.keyboard.press('Escape')
  await expect(editor).toHaveAttribute('data-mode', 'navigate')
  await expect(page.getByTestId('table-cell-0')).toHaveText('kept')
  await page.keyboard.press('Escape')
  await expect(editor).toHaveCount(0)
  await expect(page.locator('[role="table"] > div').nth(0)).toHaveText('kept')
})

/*
 * Every way out of an editor commits now, so one that changed nothing must
 * commit NOTHING — or opening a note and pressing Escape would put a no-op on
 * the undo stack, and the next undo would appear to do nothing at all.
 */
test('leaving an edit that changed nothing adds no undo step', async ({ page }) => {
  await page.keyboard.press('s')
  await page.locator(CANVAS).click({ position: { x: 340, y: 260 } })
  await page.keyboard.type('Untouched')
  await page.locator(CANVAS).click({ position: { x: 1100, y: 640 } })

  const note = page.locator('[data-object-type="sticky"]')
  await note.dblclick()
  await expect(page.locator(EDITOR)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator(EDITOR)).toHaveCount(0)

  // The one undo takes back the typing, not an empty re-save of it.
  await page.keyboard.press(`${MOD}+z`)
  await expect(note).not.toContainText('Untouched')
})
