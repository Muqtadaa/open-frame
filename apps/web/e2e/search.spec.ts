import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * Finding things by what they MEAN, walked in a browser.
 *
 * Phase 3's third "done when": board search finds objects by their semantic
 * fields, not only their text. Every type has declared a `searchText` since
 * Phase 1 and nothing read it — so this is also the test that makes those
 * declarations falsifiable at last (rule 21).
 */

const CANVAS = '[data-testid="canvas"]'
const EDITOR = '[data-testid="rich-text-editor"]'
const AT = { x: 340, y: 280 }
const CLEAR = { x: 1120, y: 620 }

async function freshBoard(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await page.evaluate(
    async () =>
      new Promise<void>((resolve) => {
        const r = indexedDB.deleteDatabase('openframe')
        r.onsuccess = () => resolve()
        r.onerror = () => resolve()
        r.onblocked = () => resolve()
      }),
  )
  await page.reload()
  await expect(page.locator(CANVAS)).toBeVisible()
  await expect(page.getByTestId('tool-select')).toBeVisible()
}

async function note(page: Page, at: { x: number; y: number }, text: string): Promise<void> {
  await page.keyboard.press('s')
  await page.locator(CANVAS).click({ position: at })
  await page.locator(EDITOR).fill(text)
  await page.locator(CANVAS).click({ position: CLEAR })
  await page.keyboard.press('v')
}

async function openSearch(page: Page): Promise<void> {
  await page.keyboard.press('Control+f')
  await expect(page.getByTestId('search-panel')).toBeVisible()
}

test.describe('finding things on a board', () => {
  test.beforeEach(async ({ page }) => {
    await freshBoard(page)
  })

  test('opens with the shortcut and leaves on Escape', async ({ page }) => {
    await openSearch(page)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('search-panel')).toHaveCount(0)
  })

  test('finds a note by its text', async ({ page }) => {
    await note(page, AT, 'Customers do not understand pricing')
    await openSearch(page)
    await page.getByTestId('search-input').fill('understand')
    await expect(page.getByTestId('search-count')).toHaveText('1 found')
    await expect(page.locator('.of-search__summary')).toContainText('Customers do not')
  })

  /**
   * The point of the whole phase. A sticky and a piece of evidence can say the
   * same words; only one of them has a source, and only one is found by it.
   */
  test('finds evidence by a field that is not its text', async ({ page }) => {
    await note(page, AT, 'Could not find the price')
    await page.locator(CANVAS).click({ position: AT })
    await page.locator(CANVAS).click({ position: AT, button: 'right' })
    await page.getByTestId('menu-promote-to-evidence').click()
    await page.locator(CANVAS).click({ position: AT })
    await page.getByTestId('field-source').fill('September usability study')
    await page.getByTestId('field-tags').fill('pricing, comprehension')
    await page.getByTestId('field-source').click()
    await page.locator(CANVAS).click({ position: CLEAR })

    await openSearch(page)
    await page.getByTestId('search-input').fill('September')
    await expect(page.getByTestId('search-count')).toHaveText('1 found')
    await expect(page.locator('.of-search__type')).toHaveText('evidence')
  })

  test('filters by type and by tag', async ({ page }) => {
    await note(page, AT, 'A plain note about pricing')
    await note(page, { x: 340, y: 500 }, 'Another note about pricing')
    await page.locator(CANVAS).click({ position: AT })
    await page.locator(CANVAS).click({ position: AT, button: 'right' })
    await page.getByTestId('menu-promote-to-evidence').click()
    await page.locator(CANVAS).click({ position: AT })
    await page.getByTestId('field-tags').fill('pricing')
    await page.locator(CANVAS).click({ position: CLEAR })

    await openSearch(page)
    await page.getByTestId('search-input').fill('pricing')
    await expect(page.getByTestId('search-count')).toHaveText('2 found')

    await page.getByTestId('search-input').fill('type:evidence pricing')
    await expect(page.getByTestId('search-count')).toHaveText('1 found')

    // The word is in both, but a TAG on only one.
    await page.getByTestId('search-input').fill('#pricing')
    await expect(page.getByTestId('search-count')).toHaveText('1 found')
  })

  test('says so when nothing matches', async ({ page }) => {
    await note(page, AT, 'Something')
    await openSearch(page)
    await page.getByTestId('search-input').fill('xyzzy')
    await expect(page.getByTestId('search-count')).toHaveText('nothing found')
  })

  /**
   * A result you cannot look at is not a result. The board may be scrolled
   * anywhere, so choosing one selects it AND pans the minimum needed to see it.
   */
  test('taking a result selects it and brings it into view', async ({ page }) => {
    await note(page, AT, 'Far away note')
    // Scroll the board so the note is off screen.
    await page.mouse.move(700, 400)
    await page.mouse.wheel(0, -4000)
    await expect(page.locator('[data-object-id]')).toHaveCount(0)

    await openSearch(page)
    await page.getByTestId('search-input').fill('Far away')
    await page.keyboard.press('Enter')

    await expect(page.getByTestId('search-panel')).toHaveCount(0)
    await expect(page.locator('[data-object-id]')).toHaveCount(1)
    await expect(page.getByTestId('selection-overlay')).toBeVisible()
  })

  test('the arrow keys move through the results', async ({ page }) => {
    await note(page, AT, 'Alpha pricing')
    await note(page, { x: 340, y: 500 }, 'Beta pricing')
    await openSearch(page)
    await page.getByTestId('search-input').fill('pricing')
    await expect(page.locator('.of-search__result--on')).toContainText('Alpha')
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('.of-search__result--on')).toContainText('Beta')
  })

  /**
   * The board's own shortcuts must not fire while a query is being typed: a 'v'
   * in "discovery" must stay a 'v', and Delete must not destroy the selection.
   */
  test('typing a query does not drive the canvas', async ({ page }) => {
    await note(page, AT, 'Conversion review')
    await page.locator(CANVAS).click({ position: AT })
    await openSearch(page)
    await page.getByTestId('search-input').fill('conversion')
    await page.getByTestId('search-input').press('Delete')
    await expect(page.locator('[data-object-id]')).toHaveCount(1)
  })
})
