import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * The board's navigation, along the top.
 *
 * The way out, the board's name, history and the rest of the record line sat
 * at the bottom of the window, where nothing reads as the page's own heading.
 * They are the page's navigation, so they sit where navigation is looked for,
 * and the name reads as the name of the page rather than as one more readout.
 */
const CANVAS = '[data-testid="canvas"]'

async function board(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await expect(page.locator(CANVAS)).toBeVisible()
  await expect(page.getByTestId('tool-select')).toBeVisible()
}

test('sits along the top of the window, above the rail', async ({ page }) => {
  await board(page)
  const bar = await page.getByTestId('status-bar').boundingBox()
  const rail = await page.getByRole('toolbar', { name: 'Board tools' }).boundingBox()
  if (bar === null || rail === null) throw new Error('bar or rail is not on screen')
  expect(bar.y).toBeLessThan(40)
  expect(rail.y).toBeGreaterThanOrEqual(bar.y + bar.height)
})

test('names the board in the interface’s own voice, not as a readout', async ({ page }) => {
  await board(page)
  const title = page.getByTestId('board-title')
  await expect(title).toHaveCSS('font-weight', '600')
  const face = await title.evaluate((el) => getComputedStyle(el).fontFamily)
  expect(face).not.toMatch(/mono/i)
})

test('opens its tips downward, into the window', async ({ page }) => {
  await board(page)
  await page.getByTestId('undo').focus()
  const tip = await page.getByTestId('undo').evaluate((el) => {
    const after = getComputedStyle(el, '::after')
    return { top: after.top, bottom: after.bottom }
  })
  expect(Number.parseFloat(tip.top)).toBeGreaterThan(0)
})

test('keeps an object’s panel clear of it, however high the object sits', async ({ page }) => {
  await board(page)
  await page.keyboard.press('s')
  // A note placed high enough that its top edge is under the bar.
  await page.locator(CANVAS).click({ position: { x: 500, y: 110 } })
  await page.locator(CANVAS).click({ position: { x: 1100, y: 600 } })
  await page.keyboard.press('v')
  const bar = await page.getByTestId('status-bar').boundingBox()
  const note = await page.locator('[data-object-type="sticky"]').boundingBox()
  if (bar === null || note === null) throw new Error('bar or note is not on screen')
  expect(note.y).toBeLessThan(bar.y + bar.height)
  await page.mouse.click(note.x + 20, note.y + note.height - 20)
  const panel = await page.getByTestId('inspector').boundingBox()
  if (panel === null) throw new Error('the panel is not on screen')
  expect(panel.y).toBeGreaterThanOrEqual(bar.y + bar.height)
})

/**
 * The board's name is the page's name (C3 #3). A person returning days later,
 * with several boards open, finds them by their tabs — and every tab read
 * "OpenFrame" — and a name cut to 22 characters beside half a bar of empty
 * ground could not be read at all.
 */
test.describe('the board’s name', () => {
  async function rename(page: Page, name: string): Promise<void> {
    await page.getByTestId('board-title').click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type(name)
    await page.keyboard.press('Enter')
  }

  test('names the tab', async ({ page }) => {
    await board(page)
    await rename(page, 'Checkout research')
    await expect(page).toHaveTitle('Checkout research — OpenFrame')
  })

  test('uses the room the bar has before it shortens', async ({ page }) => {
    await board(page)
    const name = 'Checkout funnel teardown — September interviews'
    await rename(page, name)
    const title = page.getByTestId('board-title')
    await expect(title).toHaveText(name)
    // A pixel of rounding is not a cut-off letter.
    const clipped = await title.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
    expect(clipped).toBe(false)
  })

  test('shows the whole of a name too long for the bar', async ({ page }) => {
    await board(page)
    const name =
      'Q3 pricing research synthesis — onboarding, checkout, retention and churn interviews across four markets'
    await rename(page, name)
    const title = page.getByTestId('board-title')
    expect(await title.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
    await expect(title).toHaveAttribute('data-tip', name)
  })

  test('is the heading of the page’s navigation', async ({ page }) => {
    await board(page)
    const nav = page.getByRole('navigation', { name: 'Board' })
    await expect(nav).toBeVisible()
    await expect(nav.getByRole('heading', { level: 1 })).toHaveText('Untitled board')
  })
})

/**
 * The keyboard is never dropped (C3 #3, WCAG 2.4.3). Finishing an edit on the
 * bar unmounted the field and focus fell to the page, so a keyboard user was
 * sent back to the start after every rename, every typed zoom and the last
 * undo.
 */
test.describe('the keyboard on the bar', () => {
  test('comes back to the name after renaming, and can rename again', async ({ page }) => {
    await board(page)
    await page.getByTestId('board-title').click()
    await page.keyboard.type('Renamed')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('board-title')).toBeFocused()
    // Handed back by the keyboard, so Enter presses it rather than the board.
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('board-title-input')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('board-title')).toBeFocused()
  })

  test('comes back to the zoom readout after typing a zoom', async ({ page }) => {
    await board(page)
    await page.getByTestId('zoom-percent').click()
    await page.keyboard.type('150')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('zoom-percent')).toBeFocused()
    await expect(page.getByTestId('zoom-percent')).toHaveText('150%')
  })

  test('moves to redo when the last undo leaves nothing to undo', async ({ page }) => {
    await board(page)
    await page.keyboard.press('s')
    await page.locator(CANVAS).click({ position: { x: 500, y: 400 } })
    await page.keyboard.press('Escape')
    await page.getByTestId('undo').focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('undo')).toBeDisabled()
    await expect(page.getByTestId('redo')).toBeFocused()
  })

  test('names each control by what it is, never by its tip', async ({ page }) => {
    await board(page)
    await expect(page.getByRole('button', { name: 'Untitled board', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Zoom 100%', exact: true })).toBeVisible()
  })

  test('gives every control a target a pointer can find', async ({ page }) => {
    await board(page)
    const theme = await page.getByTestId('theme-toggle').boundingBox()
    const source = await page.getByTestId('source-link').boundingBox()
    expect(theme?.width ?? 0).toBeGreaterThanOrEqual(30)
    expect(source?.height ?? 0).toBeGreaterThanOrEqual(24)
  })
})
