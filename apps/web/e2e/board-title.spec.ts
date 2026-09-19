import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL, HOME_URL } from './routes.js'

/**
 * Naming a board.
 *
 * Until this existed, every board was called "Untitled board" and the board
 * list was a column of identical rows — a surface that is real and useless at
 * the same time. So the assertion that matters most here is the last one: the
 * name reaches the list.
 */

const TITLE = '[data-testid="board-title"]'
const INPUT = '[data-testid="board-title-input"]'

async function rename(page: Page, to: string): Promise<void> {
  await page.locator(TITLE).click()
  await page.locator(INPUT).fill(to)
  await page.locator(INPUT).press('Enter')
}

test.beforeEach(async ({ page }) => {
  await page.goto(BOARD_URL)
  await page.waitForSelector('[data-testid="status-bar"]')
})

test.describe('the board name', () => {
  test('starts as the default and becomes what you type', async ({ page }) => {
    await expect(page.locator(TITLE)).toHaveText('Untitled board')

    await rename(page, 'Pricing research')

    await expect(page.locator(TITLE)).toHaveText('Pricing research')
  })

  test('survives a reload', async ({ page }) => {
    await rename(page, 'Pricing research')

    await page.waitForTimeout(800) // autosave is debounced
    await page.reload()
    await page.waitForSelector('[data-testid="status-bar"]')

    await expect(page.locator(TITLE)).toHaveText('Pricing research')
  })

  test('is undone in one press', async ({ page }) => {
    await rename(page, 'Pricing research')

    await page.keyboard.press('ControlOrMeta+z')

    await expect(page.locator(TITLE)).toHaveText('Untitled board')
  })

  test('is left alone by Escape', async ({ page }) => {
    await page.locator(TITLE).click()
    await page.locator(INPUT).fill('Never mind')
    await page.locator(INPUT).press('Escape')

    await expect(page.locator(TITLE)).toHaveText('Untitled board')
  })

  /**
   * The canvas keymap claims single letters for tools. Without the keydown
   * being stopped at the input, naming a board "Sticky" would place four
   * objects on it.
   */
  test('does not drive the canvas while being typed', async ({ page }) => {
    const before = await page.evaluate(
      () =>
        (window as unknown as { __openframe: { runtime: { store: { getDocument(): { objects: ReadonlyMap<string, unknown> } } } } }).__openframe.runtime.store.getDocument()
          .objects.size,
    )

    await page.locator(TITLE).click()
    await page.locator(INPUT).fill('Sticky text shape frame')
    await page.locator(INPUT).press('Enter')

    const after = await page.evaluate(
      () =>
        (window as unknown as { __openframe: { runtime: { store: { getDocument(): { objects: ReadonlyMap<string, unknown> } } } } }).__openframe.runtime.store.getDocument()
          .objects.size,
    )
    expect(after).toBe(before)
  })

  test('refuses an empty name and keeps the one it had', async ({ page }) => {
    await page.locator(TITLE).click()
    await page.locator(INPUT).fill('   ')
    await page.locator(INPUT).press('Enter')

    await expect(page.locator(TITLE)).toHaveText('Untitled board')
  })

  /** The whole reason renaming exists. */
  test('is what the board list shows', async ({ page }) => {
    await rename(page, 'Pricing research')

    await page.waitForTimeout(800) // autosave is debounced
    await page.goto(HOME_URL)

    await expect(page.getByTestId('home-boards')).toContainText('Pricing research')
  })
})

/**
 * The record line is bottom-left and the zoom cluster is bottom-right, and the
 * only thing keeping them apart was that the line happened to be short enough.
 * Adding the board's name to it left 31px of clearance and then took it: the
 * dev panel's button ended up over the zoom controls, where it silently
 * swallowed every click aimed at them. Nothing failed except one unrelated
 * test, thirty seconds at a time.
 */
test('the record line never grows into the zoom cluster', async ({ page }) => {
  await rename(page, 'A board name long enough to push this line right across the screen')

  const line = await page.locator('[data-testid="status-bar"]').boundingBox()
  const zoom = await page.locator('.of-zoom').boundingBox()

  expect(line).not.toBeNull()
  expect(zoom).not.toBeNull()
  if (line === null || zoom === null) return
  expect(line.x + line.width).toBeLessThanOrEqual(zoom.x)
})
