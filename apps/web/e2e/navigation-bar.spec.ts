import type { Locator, Page } from '@playwright/test'

import { CANVAS, expect, openBoard, test, boxOf } from './fixtures.js'
import { signedIn } from './signed-in.js'
import { library, TRACKS } from './music.js'
import { BOARD_URL } from './routes.js'

/**
 * The board's navigation, along the top.
 *
 * The way out, the board's name and the rest of the record line sat
 * at the bottom of the window, where nothing reads as the page's own heading.
 * They are the page's navigation, so they sit where navigation is looked for,
 * and the name reads as the name of the page rather than as one more readout.
 */

const SHARED = 'brd_abcdefgh12345678'

test('sits along the top of the window, above the rail', async ({ page }) => {
  await openBoard(page)
  const bar = await boxOf(page.getByTestId('status-bar'))
  const rail = await boxOf(page.getByRole('toolbar', { name: 'Board tools' }))
  expect(bar.y).toBeLessThan(40)
  expect(rail.y).toBeGreaterThanOrEqual(bar.y + bar.height)
})

test('names the board in the interface’s own voice, not as a readout', async ({ page }) => {
  await openBoard(page)
  const title = page.getByTestId('board-title')
  await expect(title).toHaveCSS('font-weight', '600')
  const face = await title.evaluate((el) => getComputedStyle(el).fontFamily)
  expect(face).not.toMatch(/mono/i)
})

test('opens its tips downward, into the window', async ({ page }) => {
  await openBoard(page)
  await page.getByTestId('board-exit').focus()
  const tip = await page.getByTestId('board-exit').evaluate((el) => {
    const after = getComputedStyle(el, '::after')
    return { top: after.top, bottom: after.bottom }
  })
  expect(Number.parseFloat(tip.top)).toBeGreaterThan(0)
})

/*
 * Undo and redo are how the board is handled, not what it is called or whether
 * it is safe, so they sit with zoom and snap rather than taking the bar's best
 * place beside the name — where, on a fresh board, they were two disabled
 * buttons.
 */
test('keeps undo and redo with zoom, not on the bar', async ({ page }) => {
  await openBoard(page)
  const cluster = page.getByTestId('zoom-control')
  await expect(cluster.getByTestId('undo')).toBeVisible()
  await expect(cluster.getByTestId('redo')).toBeVisible()
  await expect(page.getByTestId('status-bar').getByTestId('undo')).toHaveCount(0)
  await expect(cluster.getByRole('group', { name: 'History' })).toBeVisible()
})

/*
 * What is done to the board as a whole sits in one menu beside its name:
 * Rename, and its history, which had a clock face of its own among the
 * session's tools. The theme went to the account sheet: it is chosen once
 * and kept, and on the bar it was an unlabelled moon.
 */
test.describe('the board menu', () => {
  test('renames, and opens the history', async ({ page }) => {
    await openBoard(page)
    await page.getByTestId('board-menu').click()
    await page.getByRole('menuitem', { name: 'Rename' }).click()
    await expect(page.getByTestId('board-title-input')).toBeFocused()
    await page.keyboard.press('Escape')

    await page.getByTestId('board-menu').click()
    await page.getByRole('menuitem', { name: 'Version history…' }).click()
    await expect(page.getByRole('dialog', { name: 'Version history' })).toBeVisible()
  })

  /*
   * On paper, in both worlds. The menu and the history sheet it opens were
   * drawn straight onto the board, text over the grid and the notes beneath
   * (owner, 10-07): neither carried the surface every other menu and sheet
   * does.
   */
  for (const world of ['notebook', 'after-hours'] as const) {
    test(`sits on paper, and so does the history it opens (${world})`, async ({ page }) => {
      await page.addInitScript((theme) => {
        if (theme === 'after-hours') localStorage.setItem('openframe:theme', theme)
      }, world)
      await openBoard(page)
      const papered = (locator: Locator) =>
        locator.evaluate((element) => {
          const style = getComputedStyle(element)
          return {
            ground: style.backgroundColor,
            shadow: style.boxShadow,
          }
        })

      await page.getByTestId('board-menu').click()
      const menu = await papered(page.getByRole('menu', { name: 'Board' }))
      expect(menu.ground).not.toBe('rgba(0, 0, 0, 0)')
      expect(menu.shadow).not.toBe('none')

      await page.getByRole('menuitem', { name: 'Version history…' }).click()
      const sheet = await papered(page.getByRole('dialog', { name: 'Version history' }))
      expect(sheet.ground).not.toBe('rgba(0, 0, 0, 0)')
      expect(sheet.shadow).not.toBe('none')
    })
  }

  test('is walked by the keyboard and hands it back', async ({ page }) => {
    await openBoard(page)
    await page.getByTestId('board-menu').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menuitem', { name: 'Version history…' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
    await expect(page.getByTestId('board-menu')).toBeFocused()
  })

  test('leaves the page named by the board alone', async ({ page }) => {
    await openBoard(page)
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Untitled board')
  })

  test('takes the history and the theme off the bar', async ({ page }) => {
    await openBoard(page)
    const bar = page.getByTestId('status-bar')
    await expect(bar.getByRole('button', { name: 'Version history' })).toHaveCount(0)
    await expect(bar.getByRole('button', { name: 'After Hours theme' })).toHaveCount(0)
    // Signed out, the theme is in the sign-in sheet.
    await page.getByTestId('sign-in').click()
    await page.getByTestId('theme-after-hours').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'after-hours')
    await expect(
      page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { checked: true }),
    ).toHaveText('After Hours')
  })

  test('the theme is in the account sheet when signed in', async ({ page }) => {
    await signedIn(page, [])
    await openBoard(page)
    await page.getByTestId('account').click()
    const sheet = page.getByTestId('account-sheet')
    // The sheet takes the keyboard on arrival; the theme is one Tab on.
    await expect(sheet.getByRole('button', { name: 'Sign out' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(sheet.getByTestId('theme-notebook')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(sheet.getByTestId('theme-after-hours')).toBeFocused()
    await expect(sheet.getByTestId('theme-after-hours')).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'after-hours')
  })
})

/*
 * Whether the work is safe, said once. "Saved" sat by the name while a
 * "Shared" chip with a dot sat among the people — and that chip was also the
 * share button, so one word named neither what it was nor what it did.
 */
test.describe('the safety readout', () => {
  for (const width of [1280, 390]) {
    test(`says the room is out of reach, beside what is saved, at ${String(width)}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 720 })
      await signedIn(page, [{ id: SHARED, title: 'Pricing research', role: 'owner' }])
      // A room that hangs up on every attempt.
      await page.routeWebSocket(/\/room\//, (socket) => {
        void socket.close()
      })
      await page.goto(`/?room=${SHARED}&k=${'e'.repeat(32)}`)
      const readout = page.getByTestId('save-state')
      await expect(readout).toHaveText('Offline · saved here')
      await expect(readout).toBeVisible()
      const share = page.getByTestId('share-board')
      await expect(share).toHaveText('Share')
      await expect(share).toHaveAccessibleName('Share')
    })
  }

  test('says only Saved on a board of your own', async ({ page }) => {
    await openBoard(page)
    await expect(page.getByTestId('save-state')).toHaveText('Saved')
  })
})

test('keeps an object’s panel clear of it, however high the object sits', async ({ page }) => {
  await openBoard(page)
  await page.keyboard.press('s')
  // A note placed high enough that its top edge is under the bar.
  await page.locator(CANVAS).click({ position: { x: 500, y: 110 } })
  await page.locator(CANVAS).click({ position: { x: 1100, y: 600 } })
  await page.keyboard.press('v')
  const bar = await boxOf(page.getByTestId('status-bar'))
  const note = await boxOf(page.locator('[data-object-type="sticky"]'))
  expect(note.y).toBeLessThan(bar.y + bar.height)
  await page.mouse.click(note.x + 20, note.y + note.height - 20)
  const panel = await boxOf(page.getByTestId('inspector'))
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
    await openBoard(page)
    await rename(page, 'Checkout research')
    await expect(page).toHaveTitle('Checkout research — OpenFrame')
  })

  test('uses the room the bar has before it shortens', async ({ page }) => {
    await openBoard(page)
    const name = 'Checkout funnel teardown — September interviews'
    await rename(page, name)
    const title = page.getByTestId('board-title')
    await expect(title).toHaveText(name)
    // A pixel of rounding is not a cut-off letter.
    const clipped = await title.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
    expect(clipped).toBe(false)
  })

  test('shows the whole of a name too long for the bar', async ({ page }) => {
    await openBoard(page)
    const name =
      'Q3 pricing research synthesis — onboarding, checkout, retention and churn interviews across four markets'
    await rename(page, name)
    const title = page.getByTestId('board-title')
    expect(await title.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
    await expect(title).toHaveAttribute('data-tip', name)
  })

  test('is the heading of the page’s navigation', async ({ page }) => {
    await openBoard(page)
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
    await openBoard(page)
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
    await openBoard(page)
    await page.getByTestId('zoom-percent').click()
    await page.keyboard.type('150')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('zoom-percent')).toBeFocused()
    await expect(page.getByTestId('zoom-percent')).toHaveText('150%')
  })

  test('moves to redo when the last undo leaves nothing to undo', async ({ page }) => {
    await openBoard(page)
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

  test('presses a button with Enter even when the pointer put focus there', async ({ page }) => {
    await openBoard(page)
    const session = page.getByTestId('session-button')
    await session.click()
    await expect(session).toHaveAttribute('aria-expanded', 'true')
    await session.click()
    await expect(session).toHaveAttribute('aria-expanded', 'false')
    await expect(session).toBeFocused()
    // Space after a click is the board's pan; Enter on a button only ever presses it.
    await page.keyboard.press('Enter')
    await expect(session).toHaveAttribute('aria-expanded', 'true')
  })

  test('names each control by what it is, never by its tip', async ({ page }) => {
    await openBoard(page)
    await expect(page.getByRole('button', { name: 'Untitled board', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Zoom 100%', exact: true })).toBeVisible()
  })

  test('gives every control a target a pointer can find', async ({ page }) => {
    await openBoard(page)
    const menu = await page.getByTestId('board-menu').boundingBox()
    expect(menu?.width ?? 0).toBeGreaterThanOrEqual(30)
  })
})

/**
 * The zoom readout says what it does (C3 #3). Its tip promised "Reset to
 * 100%" and a click opened a field; reset had no pointer route at all; and a
 * zoom it could not take was quietly thrown away or clamped.
 */
test.describe('the zoom readout', () => {
  test('says a click is for typing a zoom', async ({ page }) => {
    await openBoard(page)
    await expect(page.getByTestId('zoom-percent')).toHaveAttribute('data-tip', /Zoom level/)
  })

  test('offers the common zooms to a pointer', async ({ page }) => {
    await openBoard(page)
    await page.getByTestId('zoom-in').click()
    await expect(page.getByTestId('zoom-percent')).not.toHaveText('100%')
    await page.getByTestId('zoom-percent').click()
    await page.getByTestId('zoom-preset-100').click()
    await expect(page.getByTestId('zoom-percent')).toHaveText('100%')
  })

  test('says why it will not take a zoom, and keeps the field open', async ({ page }) => {
    await openBoard(page)
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
    await openBoard(page)
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
    await openBoard(page)
    await expect(page.getByTestId('selection-count')).toHaveCount(0)
    await page.keyboard.press('s')
    await page.locator(CANVAS).click({ position: { x: 500, y: 400 } })
    await page.keyboard.press('Escape')
    await page.keyboard.press('v')
    await page.locator(CANVAS).click({ position: { x: 510, y: 410 } })
    await expect(page.getByTestId('selection-count')).toHaveText('1 selected')
  })

  test('closes the account sheet on Escape without touching the board', async ({ page }) => {
    await signedIn(page, [])
    await openBoard(page)
    await page.keyboard.press('s')
    await page.locator(CANVAS).click({ position: { x: 500, y: 400 } })
    await page.locator(CANVAS).click({ position: { x: 900, y: 600 } })
    await page.keyboard.press('v')
    await page.locator(CANVAS).click({ position: { x: 510, y: 410 } })
    await expect(page.getByTestId('selection-count')).toHaveText('1 selected')
    await page.getByTestId('account').click()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('account-sheet')).toHaveCount(0)
    // One press, one thing: the selection is still there.
    await expect(page.getByTestId('selection-count')).toHaveText('1 selected')
  })

  test('signs out back to the board, not into the sign-in form', async ({ page }) => {
    await signedIn(page, [])
    await openBoard(page)
    await page.getByTestId('account').click()
    await page.getByTestId('account-sheet').getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByTestId('sign-in')).toBeVisible()
    await expect(page.getByTestId('account-dialog')).toHaveCount(0)
  })

  test('opens the account instead of signing out when the name is pressed', async ({ page }) => {
    await signedIn(page, [])
    await openBoard(page)
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
    await openBoard(page)
    await expect(page.getByTestId('wheel-mode')).toHaveText('wheel: zoom')
    await expect(
      page.getByRole('button', { name: 'Scroll wheel zooms', exact: true }),
    ).toBeVisible()
    await page.getByTestId('wheel-mode').click()
    await expect(page.getByTestId('wheel-mode')).toHaveText('wheel: pan')
  })

  test('names snap once, and lets its pressed state say whether it is on', async ({ page }) => {
    await openBoard(page)
    const snap = page.getByRole('button', { name: 'Snap to grid', exact: true })
    await expect(snap).toHaveAttribute('aria-pressed', 'true')
  })

  test('draws snap as points to land on, not as a frame’s lines', async ({ page }) => {
    await openBoard(page)
    await expect(page.getByTestId('snap-toggle').locator('svg circle')).not.toHaveCount(0)
  })

  test('reads the slider as a zoom', async ({ page }) => {
    await openBoard(page)
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
      await openBoard(page)
      const escaped = await page.getByTestId('status-bar').evaluate((bar) => {
        const edge = bar.getBoundingClientRect().right
        // Inside the zones as well as beside them.
        return [...bar.querySelectorAll(':scope > *, :scope > [role="group"] > *')]
          .filter((child) => child.getBoundingClientRect().width > 0)
          .filter((child) => child.getBoundingClientRect().right > edge + 0.5)
          .map((child) => child.getAttribute('data-testid') ?? child.className)
      })
      expect(escaped).toEqual([])
    })
  }

  /*
   * A SHARED board carries more — the room chip and whoever is here — and the
   * steps down at 640 and 480 were measured without it: the source link ran
   * out of the bar at 760, and the theme toggle at 390 (audit 2026-09-27).
   * Every labelled control, however deep, and the bar itself inside the
   * window.
   */
  for (const width of [390, 480, 560, 640, 760]) {
    test(`keeps a shared board's controls inside the bar at ${String(width)}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 720 })
      await signedIn(page, [{ id: SHARED, title: 'Pricing research', role: 'owner' }])
      await page.routeWebSocket(/\/room\//, () => undefined)
      await page.goto(`/?room=${SHARED}&k=${'e'.repeat(32)}`)
      await page.waitForSelector('[data-testid="status-bar"]')
      await expect(page.getByTestId('share-board')).toBeVisible()
      const escaped = await page.getByTestId('status-bar').evaluate((bar) => {
        const edge = Math.min(bar.getBoundingClientRect().right, window.innerWidth)
        return [...bar.querySelectorAll('[data-testid]')]
          .filter((child) => child.getBoundingClientRect().width > 0)
          .filter((child) => child.getBoundingClientRect().right > edge + 0.5)
          .map((child) => child.getAttribute('data-testid'))
      })
      expect(escaped).toEqual([])
    })
  }

  test('lines the bar up with the rail', async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 720 })
    await openBoard(page)
    const bar = await page.getByTestId('status-bar').boundingBox()
    const rail = await page.getByRole('toolbar', { name: 'Board tools' }).boundingBox()
    expect(Math.abs((bar?.x ?? 0) - (rail?.x ?? 0))).toBeLessThan(1)
  })
})

/*
 * The bar at its fullest — signed in, mentions waiting, a selection, the
 * timer and the music running, or a shared board whose room is out of reach
 * — at every width from a wide screen to a phone. It used five breakpoints,
 * each worked out for what the bar carried at the time; now it gives way by
 * measurement, a word to its icon at a time (use-squeeze.ts). Every control
 * stays on the bar, inside it, clear of its neighbours, and named.
 */
test.describe('the bar at its fullest', () => {
  const MENTIONED = {
    mentions: [1, 2].map((i) => ({
      commentId: `cmt_${String(i)}`,
      boardId: SHARED,
      boardTitle: 'Pricing research',
      authorName: 'Rowan',
      body: 'look',
    })),
  }

  async function fitted(page: Page, width: number): Promise<void> {
    const bar = page.getByTestId('status-bar')
    const report = await bar.evaluate((nav) => {
      const box = nav.getBoundingClientRect()
      // Every control, in a zone or not; never none, or this would pass vacuously.
      // The bench panel is not the product, and clips by design.
      const controls = [
        ...nav.querySelectorAll(
          ':scope > [role="group"] > *, :scope > :not([role="group"], [aria-hidden="true"], [data-testid="dev-panel"])',
        ),
      ]
        .filter((child) => child.getBoundingClientRect().width > 0)
        .map((child) => ({ name: child.className, box: child.getBoundingClientRect() }))
      const outside = controls
        .filter(({ box: own }) => own.left < box.left - 0.5 || own.right > box.right + 0.5)
        .map(({ name }) => name)
      const overlapping = controls
        .slice(1)
        .filter(({ box: own }, i) => own.left < (controls[i]?.box.right ?? 0) - 0.5)
        .map(({ name }) => name)
      return { count: controls.length, outside, overlapping, right: box.right }
    })
    expect(report.count).toBeGreaterThan(4)
    expect(report.outside).toEqual([])
    expect(report.overlapping).toEqual([])
    expect(report.right).toBeLessThanOrEqual(width)
  }

  for (const width of [1440, 1024, 760, 600, 480, 390]) {
    test(`fits a running session on a board of your own at ${String(width)}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 })
      await signedIn(page, [], 'Muqtadaa Miandara', MENTIONED)
      await library(page, TRACKS)
      await page.goto(BOARD_URL)
      await page.getByTestId('session-button').click()
      await page.getByTestId('timer-start').click()
      await page.getByTestId('music-play').click()
      await page.keyboard.press('Escape')
      await page.keyboard.press('s')
      await page.getByTestId('canvas').click({ position: { x: 300, y: 400 } })
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('inbox')).toHaveAccessibleName('Inbox, 2 new')
      await fitted(page, width)
    })

    test(`fits a shared board out of reach at ${String(width)}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await signedIn(
        page,
        [{ id: SHARED, title: 'Pricing research for the autumn launch', role: 'owner' }],
        'Muqtadaa Miandara',
        MENTIONED,
      )
      await page.routeWebSocket(/\/room\//, (socket) => {
        void socket.close()
      })
      await page.goto(`/?room=${SHARED}&k=${'e'.repeat(32)}`)
      await expect(page.getByTestId('save-state')).toContainText('Offline')
      await expect(page.getByTestId('inbox')).toBeVisible()
      await fitted(page, width)
      // Squeezed or not, Share is still called Share.
      await expect(page.getByTestId('share-board')).toHaveAccessibleName('Share')
    })
  }
})
