import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * The context menu is a menu a keyboard can drive (the ARIA menu pattern).
 *
 * It was a list of buttons that happened to sit in a popup: focus stayed
 * where it was, so the arrows nudged the object underneath; Shift+F10 opened
 * it at the window's corner; Escape dropped focus on the page AND cleared the
 * selection the menu was about.
 */
const CANVAS = '[data-testid="canvas"]'
const NOTE = { x: 340, y: 260 }

async function boardWithNote(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await expect(page.locator(CANVAS)).toBeVisible()
  await page.keyboard.press('s')
  await page.locator(CANVAS).click({ position: NOTE })
  await page.keyboard.type('Pricing page confuses')
  await page.locator(CANVAS).click({ position: { x: 1100, y: 640 } })
  await page.keyboard.press('v')
}

const menu = (page: Page) => page.getByTestId('context-menu')
const item = (page: Page, name: string) => page.getByRole('menuitem', { name, exact: true })

test.beforeEach(async ({ page }) => {
  await boardWithNote(page)
})

test('moves focus in and walks the items with arrows, Home, End and a letter', async ({ page }) => {
  await page.locator(CANVAS).click({ position: NOTE, button: 'right' })
  await expect(menu(page)).toBeVisible()
  await expect(item(page, 'Cut')).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await expect(item(page, 'Copy')).toBeFocused()
  // An unavailable item is still reachable, and says so.
  await page.keyboard.press('ArrowDown')
  await expect(item(page, 'Paste')).toBeFocused()
  await expect(item(page, 'Paste')).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Enter')
  await expect(menu(page)).toBeVisible()

  await page.keyboard.press('End')
  await expect(item(page, 'Delete')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(item(page, 'Cut')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(item(page, 'Delete')).toBeFocused()
  await page.keyboard.press('Home')
  await expect(item(page, 'Cut')).toBeFocused()
  await page.keyboard.press('d')
  await expect(item(page, 'Duplicate')).toBeFocused()
})

test('arrows move through the menu, not the object under it', async ({ page }) => {
  const note = page.locator('[data-object-type="sticky"]')
  const before = await note.boundingBox()
  await page.locator(CANVAS).click({ position: NOTE, button: 'right' })
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowUp')
  expect(await note.boundingBox()).toEqual(before)
})

test('Escape closes the menu and keeps the selection', async ({ page }) => {
  await page.locator(CANVAS).click({ position: NOTE, button: 'right' })
  await expect(item(page, 'Cut')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu(page)).toHaveCount(0)
  await expect(page.getByTestId('selection-count')).toContainText('1')
})

test('Shift+F10 opens it on the selection, not in the corner', async ({ page }) => {
  await page.locator(CANVAS).click({ position: NOTE })
  await page.keyboard.press('Shift+F10')
  await expect(menu(page)).toBeVisible()
  await expect(item(page, 'Cut')).toBeFocused()

  const note = await page.locator('[data-object-type="sticky"]').boundingBox()
  const box = await menu(page).boundingBox()
  expect(note).not.toBeNull()
  expect(box).not.toBeNull()
  if (note === null || box === null) return
  // Hung from the note: it starts at the note's edge, not at the window's.
  const touches =
    Math.abs(box.y - (note.y + note.height)) < 4 ||
    Math.abs(box.y + box.height - note.y) < 4 ||
    Math.abs(box.x - (note.x + note.width)) < 4 ||
    Math.abs(box.x + box.width - note.x) < 4
  expect(touches).toBe(true)
})

test('names an item by its label, with the shortcut declared rather than read out', async ({
  page,
}) => {
  await page.locator(CANVAS).click({ position: NOTE, button: 'right' })
  await expect(item(page, 'Cut')).toHaveAttribute('aria-keyshortcuts', /^(Control|Meta)\+X$/)
  await expect(item(page, 'Ungroup')).toHaveAttribute(
    'aria-keyshortcuts',
    /^(Control|Meta)\+Shift\+G$/,
  )
  // One notation per platform: words joined by + here, never a word and a glyph.
  await expect(page.getByTestId('menu-ungroup')).not.toContainText('⇧')
})
