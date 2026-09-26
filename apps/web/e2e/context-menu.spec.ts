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
  await expect(page.getByTestId('tool-select')).toBeVisible()
  await page.keyboard.press('s')
  await expect(page.getByTestId('tool-sticky')).toHaveAttribute('aria-pressed', 'true')
  await page.locator(CANVAS).click({ position: NOTE })
  await expect(page.locator('[contenteditable="true"]')).toBeFocused()
  await page.keyboard.type('Pricing page confuses')
  await page.locator(CANVAS).click({ position: { x: 1100, y: 640 } })
  await page.keyboard.press('v')
  await expect(page.locator('[data-object-type="sticky"]')).toContainText('Pricing page')
}

const menu = (page: Page) => page.getByTestId('context-menu')
const item = (page: Page, name: string) => page.getByRole('menuitem', { name, exact: true })

test.beforeEach(async ({ page }) => {
  await boardWithNote(page)
})

test('moves focus in and walks the items with arrows, Home, End and a letter', async ({ page }) => {
  await page.locator(CANVAS).click({ position: NOTE, button: 'right' })
  await expect(menu(page)).toBeVisible()
  await expect(item(page, 'Derive insight')).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
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
  await expect(item(page, 'Derive insight')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(item(page, 'Delete')).toBeFocused()
  await page.keyboard.press('Home')
  await expect(item(page, 'Derive insight')).toBeFocused()
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
  await expect(item(page, 'Derive insight')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu(page)).toHaveCount(0)
  await expect(page.getByTestId('selection-count')).toContainText('1')
})

/*
 * Tab leaves the menu AND moves on: the menu is not a stop in the page's
 * order, so leaving it by Tab must not cost a second press.
 */
test('Tab closes the menu and moves focus on', async ({ page }) => {
  await page.locator(CANVAS).click({ position: NOTE, button: 'right' })
  await expect(item(page, 'Derive insight')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(menu(page)).toHaveCount(0)
  const landed = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY')
  expect(landed).not.toBe('BODY')
})

test('Shift+F10 opens it on the selection, not in the corner', async ({ page }) => {
  await page.locator(CANVAS).click({ position: NOTE })
  await page.keyboard.press('Shift+F10')
  await expect(menu(page)).toBeVisible()
  await expect(item(page, 'Derive insight')).toBeFocused()

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

test.describe('what it offers', () => {
  /*
   * Deriving and promoting are the synthesis motion the product exists for.
   * They sat fourth, in a flat list, weighing what "Bring forward" weighed.
   */
  test('leads with what the selection can become', async ({ page }) => {
    await page.locator(CANVAS).click({ position: NOTE, button: 'right' })
    const names = await menu(page).locator('[role="menuitem"] > span:first-child').allTextContents()
    expect(names.slice(0, 3)).toEqual([
      'Derive insight',
      'Promote to evidence',
      'Promote to insight',
    ])
  })

  test('folds the stacking order into one Arrange submenu', async ({ page }) => {
    await page.locator(CANVAS).click({ position: NOTE, button: 'right' })
    await expect(item(page, 'Bring to front')).toHaveCount(0)
    const arrange = item(page, 'Arrange')
    await expect(arrange).toHaveAttribute('aria-haspopup', 'menu')

    // By keyboard: Right opens and goes in, Left comes back to Arrange.
    await page.keyboard.press('a')
    await expect(arrange).toBeFocused()
    await page.keyboard.press('ArrowRight')
    const sub = page.getByTestId('context-submenu')
    await expect(sub).toBeVisible()
    await expect(sub.locator('[role="menuitem"] > span:first-child')).toHaveText([
      'Bring to front',
      'Bring forward',
      'Send backward',
      'Send to back',
    ])
    await expect(item(page, 'Bring to front')).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(sub).toHaveCount(0)
    await expect(arrange).toBeFocused()

    // By pointer: hovering opens it, and an entry runs and closes both.
    await arrange.hover()
    await item(page, 'Send to back').click()
    await expect(menu(page)).toHaveCount(0)
    await expect(sub).toHaveCount(0)
  })

  // 699px of flat list did not; it was clamped up over the note it was about.
  test('hangs straight down from the pointer on a laptop-sized window', async ({ page }) => {
    await page.locator(CANVAS).click({ position: NOTE, button: 'right' })
    const box = await menu(page).boundingBox()
    const canvas = await page.locator(CANVAS).boundingBox()
    expect(box).not.toBeNull()
    if (box === null || canvas === null) return
    expect(Math.abs(box.y - (canvas.y + NOTE.y))).toBeLessThan(2)
    expect(Math.abs(box.x - (canvas.x + NOTE.x))).toBeLessThan(2)
  })

  test('marks Delete as the entry that destroys', async ({ page }) => {
    await page.locator(CANVAS).click({ position: NOTE, button: 'right' })
    await expect(page.getByTestId('menu-delete')).toHaveClass(/of-menu__item--danger/)
  })

  /*
   * Right-clicking empty board offered the object menu with every entry off —
   * a list of things you could not do. A point offers what can be done at it.
   */
  test('offers what can be done at a point on empty board', async ({ page }) => {
    const empty = { x: 700, y: 480 }
    await page.locator(CANVAS).click({ position: empty, button: 'right' })
    await expect(menu(page).locator('[role="menuitem"] > span:first-child')).toHaveText([
      'Paste here',
      'Add a note here',
      'Select all',
      'Zoom to fit',
    ])
    await expect(item(page, 'Paste here')).toHaveAttribute('aria-disabled', 'true')
    // Focus skips to the first thing that can actually be done.
    await expect(item(page, 'Add a note here')).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(menu(page)).toHaveCount(0)
    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(2)
    await expect(page.locator('[contenteditable="true"]')).toBeFocused()
    await page.keyboard.type('Here')
    await page.locator(CANVAS).click({ position: { x: 1100, y: 640 } })

    const added = page.locator('[data-object-type="sticky"]', { hasText: 'Here' })
    const box = await added.boundingBox()
    const canvas = await page.locator(CANVAS).boundingBox()
    expect(box).not.toBeNull()
    if (box === null || canvas === null) return
    // Where the menu was opened, not wherever a new note would otherwise go.
    const x = empty.x + canvas.x
    const y = empty.y + canvas.y
    expect(x >= box.x - 1 && x <= box.x + box.width + 1).toBe(true)
    expect(y >= box.y - 1 && y <= box.y + box.height + 1).toBe(true)
  })
})
