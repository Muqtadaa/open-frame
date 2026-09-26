import { expect, test, type Page } from '@playwright/test'

import { seedLocalBoard } from './seed.js'
import { BOARD_URL, HOME_URL } from './routes.js'
import { signedIn } from './signed-in.js'

/**
 * The chrome, photographed — the regression net for a stylesheet-wide change.
 *
 * The design review's extraction pass (docs/reviews/design-review.md, C2)
 * moves hundreds of raw values onto token scales and folds a dozen button
 * styles into one. The functional suite cannot see any of that: a button that
 * lost its border still clicks. These goldens are what says a refactor that
 * was meant to change NOTHING changed nothing, and what shows exactly what a
 * change that was meant to move something moved.
 *
 * Every surface is taken in both worlds. After Hours redefines every colour
 * token, so a surface that hard-codes one is only visible THERE — which is the
 * whole reason a second world needs its own photograph.
 *
 * Separate project, not part of `test:e2e`: goldens are platform-specific, and
 * these were generated in the development container. Moving them into CI means
 * regenerating them in CI's own image (review plan, B4).
 * `pnpm test:visual` compares; `pnpm test:visual --update-snapshots` accepts.
 */

const BOARD = 'brd_abcdefgh12345678'
const KEY = 'e'.repeat(32)

const WORLDS = ['notebook', 'after-hours'] as const

async function inWorld(page: Page, world: (typeof WORLDS)[number]): Promise<void> {
  if (world === 'notebook') return
  await page.addInitScript(() => {
    localStorage.setItem('openframe:theme', 'after-hours')
  })
}

async function openLocalBoard(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await page.waitForSelector('[data-testid="status-bar"]')
}

/** A room the app believes in, refused quietly: a shared board, offline. */
async function openSharedBoard(page: Page): Promise<void> {
  await signedIn(page, [{ id: BOARD, title: 'Pricing research', role: 'owner' }])
  await page.routeWebSocket(/\/room\//, () => undefined)
  await page.goto(`/?room=${BOARD}&k=${KEY}`)
  await page.waitForSelector('[data-testid="status-bar"]')
}

async function placeSticky(page: Page, text: string): Promise<void> {
  await page.keyboard.press('s')
  await page.locator('[data-testid="canvas"]').click({ position: { x: 520, y: 300 } })
  await page.keyboard.type(text)
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(1)
}

async function snap(page: Page, name: string): Promise<void> {
  // The pointer is parked off every control so no hover bed is photographed.
  await page.mouse.move(1270, 5)
  /*
   * Never mid-save: "Saving…" is wider than "Saved", so a photograph taken
   * during the half-second autosave moves everything after it in the bar.
   */
  const save = page.getByTestId('save-state')
  if ((await save.count()) > 0) {
    await expect(save).not.toHaveAttribute('data-state', /^(pending|saving)$/)
  }
  /*
   * Strict. Playwright's default per-pixel tolerance (0.2) let a whole
   * radius-scale change through on all but one surface — a 2px difference in a
   * corner is exactly the kind of change this net exists to show. Stable at
   * this setting across repeated runs in the container that took the goldens.
   */
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: 'disabled',
    caret: 'hide',
    threshold: 0.02,
  })
}

for (const world of WORLDS) {
  test.describe(`surfaces — ${world}`, () => {
    test.beforeEach(async ({ page }) => {
      await inWorld(page, world)
    })

    test('front door with a board in the ledger', async ({ page }) => {
      await seedLocalBoard(page, 'visual', 'Pricing research')
      await page.goto(HOME_URL)
      await page.waitForSelector('[data-testid="home"]')
      await snap(page, `${world}-home`)
    })

    test('empty board: rail, record line, zoom cluster', async ({ page }) => {
      await openLocalBoard(page)
      await snap(page, `${world}-board-empty`)
    })

    test('selected sticky: handles and record panel', async ({ page }) => {
      await openLocalBoard(page)
      await placeSticky(page, 'Customers do not understand pricing')
      await page.locator('[data-object-type="sticky"]').click()
      await expect(page.getByTestId('inspector')).toBeVisible()
      await snap(page, `${world}-selection-inspector`)
    })

    test('context menu', async ({ page }) => {
      await openLocalBoard(page)
      await placeSticky(page, 'Right-click me')
      await page.locator('[data-object-type="sticky"]').click({ button: 'right' })
      await expect(page.getByTestId('context-menu')).toBeVisible()
      await snap(page, `${world}-context-menu`)
    })

    test('tool tip on keyboard focus', async ({ page }) => {
      await openLocalBoard(page)
      await page
        .getByRole('button', { name: /sticky/i })
        .first()
        .focus()
      await snap(page, `${world}-tool-tip`)
    })

    test('zoom cluster tip on keyboard focus, hung from the right edge', async ({ page }) => {
      await openLocalBoard(page)
      await page.getByTestId('zoom-fit').focus()
      await expect
        .poll(() =>
          page.getByTestId('zoom-fit').evaluate((el) => getComputedStyle(el, '::after').opacity),
        )
        .toBe('1')
      await snap(page, `${world}-zoom-tip`)
    })

    test('sign-in sheet (the shell the share sheet shares)', async ({ page }) => {
      await openLocalBoard(page)
      await page.getByTestId('sign-in').click()
      await expect(page.getByTestId('account-dialog')).toBeVisible()
      await snap(page, `${world}-sign-in-sheet`)
    })

    test('shape flyout', async ({ page }) => {
      await openLocalBoard(page)
      await page.getByTestId('shape-menu').click()
      await expect(page.getByTestId('shape-ellipse')).toBeVisible()
      await snap(page, `${world}-shape-flyout`)
    })

    // The numbers and bullets are CSS counters and glyphs no functional test
    // can read back, so this is what holds 1, 2, a, b and the restart after.
    test('a note with nested lists', async ({ page }) => {
      await openLocalBoard(page)
      await page.keyboard.press('s')
      await page.locator('[data-testid="canvas"]').click({ position: { x: 520, y: 260 } })
      await page.keyboard.press('Delete')
      await page.keyboard.type('1. one')
      await page.keyboard.press('Enter')
      await page.keyboard.type('two')
      await page.keyboard.press('Enter')
      await page.keyboard.press('Tab')
      await page.keyboard.type('nested')
      await page.keyboard.press('Enter')
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Enter')
      await page.keyboard.type('- bullet')
      // Committed by leaving.
      await page.mouse.click(1100, 600)
      await expect(page.locator('[data-object-type="sticky"] [role="listitem"]')).toHaveCount(4)
      await snap(page, `${world}-note-lists`)
    })

    // No golden covered a table cell, which is how the cell bar's targets
    // came to overlap without anything noticing.
    test('table cell bar', async ({ page }) => {
      await openLocalBoard(page)
      await page.getByTestId('tool-table').click()
      await page.locator('[data-testid="canvas"]').click({ position: { x: 420, y: 320 } })
      await expect(page.getByTestId('table-cell-style')).toBeVisible()
      await snap(page, `${world}-table-cell-bar`)
    })

    // A table as a spreadsheet (ADR 0015): the letters and numbers, a range,
    // and the borders menu open over it.
    test('table borders', async ({ page }) => {
      await openLocalBoard(page)
      await page.getByTestId('tool-table').click()
      await page.locator('[data-testid="canvas"]').click({ position: { x: 420, y: 360 } })
      for (const value of ['Name', 'Owner', 'Due', 'Alpha', 'Ana', 'Mon']) {
        await page.keyboard.type(value)
        await page.keyboard.press('Tab')
      }
      await page.getByTestId('table-cell-4').click()
      await page.getByTestId('table-cell-8').click({ modifiers: ['Shift'] })
      await page.getByTestId('cell-target-borders').click()
      await page.getByTestId('borders-weight-thick').click()
      await page.getByTestId('borders-outer').click()
      await expect(page.getByTestId('cell-borders-panel')).toBeVisible()
      await snap(page, `${world}-table-borders`)
    })

    // The same table at rest: grid lines drawn by the grid, a merged cell,
    // a dashed rule and a coloured row.
    test('table at rest', async ({ page }) => {
      await openLocalBoard(page)
      await page.getByTestId('tool-table').click()
      await page.locator('[data-testid="canvas"]').click({ position: { x: 420, y: 320 } })
      for (const value of ['Name', 'Owner', 'Due', 'Alpha', 'Ana', 'Mon', 'Merged across']) {
        await page.keyboard.type(value)
        await page.keyboard.press('Tab')
      }
      await page.getByTestId('table-cell-6').click()
      await page.getByTestId('table-cell-7').click({ modifiers: ['Shift'] })
      await page.getByTestId('table-cell-6').click({ button: 'right' })
      await page.getByTestId('table-menu-merge').click()
      await page.getByTestId('table-row-2').click()
      await page.getByTestId('cell-fill-yellow').click()
      await page.getByTestId('cell-target-borders').click()
      await page.getByTestId('borders-dash-dashed').click()
      await page.getByTestId('borders-weight-medium').click()
      await page.getByTestId('borders-color-red').click()
      await page.getByTestId('borders-bottom').click()
      await page.mouse.click(1100, 600)
      await expect(page.getByTestId('table-editor')).toHaveCount(0)
      await snap(page, `${world}-table-at-rest`)
    })

    test('comment composer', async ({ page }) => {
      await openSharedBoard(page)
      await page.getByTestId('tool-comment').click()
      await page.locator('[data-testid="canvas"]').click({ position: { x: 420, y: 260 } })
      await expect(page.getByTestId('comment-panel')).toBeVisible()
      await snap(page, `${world}-comment-composer`)
    })

    test('password gate', async ({ page }) => {
      await signedIn(page, [])
      await page.routeWebSocket(/\/room\//, (ws) => {
        void ws.close({ code: 4003, reason: 'This board needs its password' })
      })
      await page.goto(`/?room=${BOARD}&k=${KEY}`)
      await expect(page.getByTestId('board-locked')).toBeVisible()
      await snap(page, `${world}-board-locked`)
    })
  })
}
