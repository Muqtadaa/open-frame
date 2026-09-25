import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'
import { signedIn } from './signed-in.js'

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

/**
 * The zoom readout says what it does (C3 #3). Its tip promised "Reset to
 * 100%" and a click opened a field; reset had no pointer route at all; and a
 * zoom it could not take was quietly thrown away or clamped.
 */
test.describe('the zoom readout', () => {
  test('says a click is for typing a zoom', async ({ page }) => {
    await board(page)
    await expect(page.getByTestId('zoom-percent')).toHaveAttribute('data-tip', /Type a zoom/)
  })

  test('offers the common zooms to a pointer', async ({ page }) => {
    await board(page)
    await page.getByTestId('zoom-in').click()
    await expect(page.getByTestId('zoom-percent')).not.toHaveText('100%')
    await page.getByTestId('zoom-percent').click()
    await page.getByTestId('zoom-preset-100').click()
    await expect(page.getByTestId('zoom-percent')).toHaveText('100%')
  })

  test('says why it will not take a zoom, and keeps the field open', async ({ page }) => {
    await board(page)
    await page.getByTestId('zoom-percent').click()
    await page.keyboard.type('5000')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alert')).toHaveText(/5–1600%/)
    await expect(page.getByTestId('zoom-input')).toBeFocused()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('abc')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alert')).toHaveText(/number/)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('zoom-percent')).toHaveText('100%')
  })
})

/**
 * What the bar carries (C3 #3). A count of objects nobody needs, a count of
 * none selected that never went away, the source link run into the account,
 * and a name that signed you out when you pressed it — while the one thing a
 * local-first board most needs to say, that the work is safe, was nowhere.
 */
test.describe('what the bar carries', () => {
  test('says the work is saved, and when it is being saved', async ({ page }) => {
    await board(page)
    const state = page.getByTestId('save-state')
    await expect(state).toHaveText('Saved')
    await expect(state).toHaveAttribute('data-tip', /on this device/)
    await page.keyboard.press('s')
    await page.locator(CANVAS).click({ position: { x: 500, y: 400 } })
    await expect(state).toHaveText('Saving…')
    await expect(state).toHaveText('Saved')
    await expect(page.getByTestId('status-bar')).not.toContainText('objects')
  })

  test('counts a selection only when there is one', async ({ page }) => {
    await board(page)
    await expect(page.getByTestId('selection-count')).toHaveCount(0)
    await page.keyboard.press('s')
    await page.locator(CANVAS).click({ position: { x: 500, y: 400 } })
    await page.keyboard.press('Escape')
    await page.keyboard.press('v')
    await page.locator(CANVAS).click({ position: { x: 510, y: 410 } })
    await expect(page.getByTestId('selection-count')).toHaveText('1 selected')
  })

  test('sets the source link last, after the app’s own controls', async ({ page }) => {
    await board(page)
    const order = await page
      .getByTestId('status-bar')
      .evaluate((bar) =>
        [...bar.querySelectorAll('[data-testid]')].map((el) => el.getAttribute('data-testid')),
      )
    const source = order.indexOf('source-link')
    expect(source).toBeGreaterThan(order.indexOf('theme-toggle'))
    expect(source).toBeGreaterThan(order.indexOf('sign-in'))
  })

  test('opens the account instead of signing out when the name is pressed', async ({ page }) => {
    await signedIn(page, [])
    await board(page)
    await page.getByTestId('account').click()
    const sheet = page.getByTestId('account-sheet')
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('Muqtadaa Miandara')
    // Still signed in: the name is still on the bar.
    await expect(page.getByTestId('account')).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })
})

/**
 * The zoom cluster's two settings say what they are (C3 #3). "🖱 zoom" read
 * as the cluster's heading; snap wore nearly the Frame tool's glyph; both
 * announced whole instruction sentences as their names, and the slider read
 * its raw position, "0.519".
 */
test.describe('the zoom cluster', () => {
  test('labels the wheel setting as the wheel’s', async ({ page }) => {
    await board(page)
    await expect(page.getByTestId('wheel-mode')).toHaveText('wheel: zoom')
    await expect(
      page.getByRole('button', { name: 'Scroll wheel zooms', exact: true }),
    ).toBeVisible()
    await page.getByTestId('wheel-mode').click()
    await expect(page.getByTestId('wheel-mode')).toHaveText('wheel: pan')
  })

  test('names snap once, and lets its pressed state say whether it is on', async ({ page }) => {
    await board(page)
    const snap = page.getByRole('button', { name: 'Snap to grid', exact: true })
    await expect(snap).toHaveAttribute('aria-pressed', 'true')
  })

  test('draws snap as points to land on, not as a frame’s lines', async ({ page }) => {
    await board(page)
    await expect(page.getByTestId('snap-toggle').locator('svg circle')).not.toHaveCount(0)
  })

  test('reads the slider as a zoom', async ({ page }) => {
    await board(page)
    await expect(page.getByTestId('zoom-slider')).toHaveAttribute('aria-valuetext', '100%')
  })
})

/**
 * A narrow window (C3 #3). At 420 pixels "Sign in" and the theme toggle ran
 * out of the bar's own box; under 820 the bar stepped in to 12px from the edge
 * while the rail stayed at 20.
 */
test.describe('a narrow window', () => {
  for (const width of [390, 560, 760]) {
    test(`keeps every control inside the bar at ${String(width)}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 720 })
      await board(page)
      const escaped = await page.getByTestId('status-bar').evaluate((bar) => {
        const edge = bar.getBoundingClientRect().right
        return [...bar.children]
          .filter((child) => child.getBoundingClientRect().width > 0)
          .filter((child) => child.getBoundingClientRect().right > edge + 0.5)
          .map((child) => child.getAttribute('data-testid') ?? child.className)
      })
      expect(escaped).toEqual([])
    })
  }

  test('lines the bar up with the rail', async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 720 })
    await board(page)
    const bar = await page.getByTestId('status-bar').boundingBox()
    const rail = await page.getByRole('toolbar', { name: 'Board tools' }).boundingBox()
    expect(Math.abs((bar?.x ?? 0) - (rail?.x ?? 0))).toBeLessThan(1)
  })
})
