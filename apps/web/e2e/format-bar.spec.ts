import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * The format bar says what size the text is, stops at the ends of the
 * ladder, lists its shortcuts, and can be reached without a pointer.
 */
const CANVAS = '[data-testid="canvas"]'
const EDITOR = '[contenteditable="true"]'
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function editingNote(page: Page, text: string): Promise<void> {
  await page.goto(BOARD_URL)
  await expect(page.locator(CANVAS)).toBeVisible()
  await expect(page.getByTestId('tool-select')).toBeVisible()
  await page.keyboard.press('s')
  await expect(page.getByTestId('tool-sticky')).toHaveAttribute('aria-pressed', 'true')
  await page.locator(CANVAS).click({ position: { x: 340, y: 300 } })
  await expect(page.locator(EDITOR)).toBeFocused()
  await page.keyboard.type(text)
  await page.keyboard.press(`${MOD}+a`)
}

test('shows the size between the steppers, and switches them off at the ends', async ({ page }) => {
  await editingNote(page, 'Headline')
  const size = page.getByTestId('format-size')
  await expect(size).toHaveText('×1')

  await page.getByTestId('format-bigger').click()
  await expect(size).toHaveText('×1.4')
  // The rest of the way by the new shortcut, which steps the same ladder.
  for (let i = 0; i < 6; i++) await page.keyboard.press(`${MOD}+Shift+Period`)
  await expect(size).toHaveText('×7.6')
  await expect(page.getByTestId('format-bigger')).toHaveAttribute('aria-disabled', 'true')

  // Pressing a switched-off step does nothing.
  await page.getByTestId('format-bigger').dispatchEvent('click')
  await expect(size).toHaveText('×7.6')
  for (let i = 0; i < 8; i++) await page.keyboard.press(`${MOD}+Shift+Comma`)
  await expect(size).toHaveText('×0.6')
  await expect(page.getByTestId('format-smaller')).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByTestId('format-bigger')).not.toHaveAttribute('aria-disabled', 'true')
})

test('every control names its shortcut, and the new ones work', async ({ page }) => {
  await editingNote(page, 'Crossed out')
  const ctrl = process.platform === 'darwin' ? '⌘' : 'Ctrl+'
  await expect(page.getByTestId('format-bold')).toHaveAttribute(
    'data-tip',
    new RegExp(`${ctrl.replace('+', '\\+')}B`),
  )
  await expect(page.getByTestId('format-strike')).toHaveAttribute('aria-keyshortcuts', /Shift\+X$/)

  await page.keyboard.press(`${MOD}+Shift+X`)
  await expect(page.getByTestId('format-strike')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press(`${MOD}+Shift+Period`)
  await expect(page.getByTestId('format-size')).toHaveText('×1.4')
  await page.keyboard.press(`${MOD}+Shift+Comma`)
  await expect(page.getByTestId('format-size')).toHaveText('×1')
})

/*
 * The bar was out of the keyboard's reach: Tab left the text, which ended the
 * edit and took the bar with it.
 */
test('Alt+F10 goes into the bar, the arrows move, and Escape comes back', async ({ page }) => {
  await editingNote(page, 'Keyboard only')
  await page.keyboard.press('Alt+F10')
  await expect(page.getByTestId('format-bold')).toBeFocused()
  // Still editing: going to the bar is not leaving the text.
  await expect(page.locator(EDITOR)).toHaveCount(1)

  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('format-italic')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('format-italic')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  // Wraps from the first to the last.
  await expect(page.getByTestId('format-number')).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(page.locator(EDITOR)).toBeFocused()
  // Back where it was: the whole text still selected, so typing replaces it.
  await page.keyboard.type('Replaced')
  await page.locator(CANVAS).click({ position: { x: 1100, y: 640 } })
  const note = page.locator('[data-object-type="sticky"]')
  await expect(note).toHaveText('Replaced')
})

test('leaving the bar for the board ends the edit and keeps it', async ({ page }) => {
  await editingNote(page, 'Kept from the bar')
  await page.keyboard.press('Alt+F10')
  await page.keyboard.press('Enter')
  await page.locator(CANVAS).click({ position: { x: 1100, y: 640 } })
  await expect(page.locator(EDITOR)).toHaveCount(0)
  await expect(page.locator('[data-object-type="sticky"] strong')).toHaveText('Kept from the bar')
})

// The same field is every text's, so a table cell reaches its bar the same way.
test('Alt+F10 reaches the bar from a table cell and Escape comes back to it', async ({ page }) => {
  await page.goto(BOARD_URL)
  await expect(page.getByTestId('tool-select')).toBeVisible()
  await page.getByTestId('tool-table').click()
  await page.locator(CANVAS).click({ position: { x: 340, y: 300 } })
  await page.keyboard.type('cell')
  await page.keyboard.press('Alt+F10')
  await expect(page.getByTestId('format-bold')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('format-bold')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('table-editor')).toHaveAttribute('data-mode', 'edit')
  await expect(page.locator(EDITOR)).toBeFocused()
})

// A mixed selection is mixed. Stepping still starts from the object's size.
test('says a selection of two sizes is mixed, not the default', async ({ page }) => {
  await editingNote(page, 'ab')
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press(`${MOD}+Shift+Period`)
  await page.keyboard.press(`${MOD}+Shift+Period`)
  await expect(page.getByTestId('format-size')).toHaveText('×2')
  await page.keyboard.press(`${MOD}+a`)
  await expect(page.getByTestId('format-size')).toHaveText('—')
  await expect(page.getByTestId('format-size')).toHaveAttribute('aria-label', 'Text size mixed')
})
