import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'
import { MUSIC_GENRES } from '@openframe/core/facilitation'

import { buildBoard } from './boards.js'
import { library, TRACKS } from './music.js'
import { seedBoard } from './fixtures.js'
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

/** Rewrites the stored local board, then reopens it. */
async function rewriteStoredBoard(page: Page, how: 'newer' | 'unknown-object'): Promise<void> {
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved')
  await page.evaluate(async (mode) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('openframe')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('open failed'))
    })
    const transaction = db.transaction('boards', 'readwrite')
    const store = transaction.objectStore('boards')
    const request = store.get('board_local')
    await new Promise((resolve) => {
      request.onsuccess = resolve
    })
    const record = request.result as {
      payload: {
        schemaVersion: number
        board: { meta: { title: string }; objects: { type: string }[] }
      }
    }
    if (mode === 'newer') {
      record.payload.schemaVersion = 999
      record.payload.board.meta.title = 'Pricing research'
    } else {
      const first = record.payload.board.objects[0]
      if (first !== undefined) first.type = 'kanban-card'
    }
    store.put(record)
    await new Promise((resolve) => {
      transaction.oncomplete = resolve
    })
    db.close()
  }, how)
  await page.reload()
  await page.waitForSelector('[data-testid="status-bar"]')
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

    // Two people's reactions on a note, one of them yours, and the bar to add more.
    test('reactions on a note', async ({ page }) => {
      await seedBoard(
        page,
        buildBoard((board) => {
          const note = board.note('Customers do not understand pricing', { x: 520, y: 300 })
          board.react(note, 'plus-one', { key: 'g_0123456789abcdef', name: 'Heron', hue: 200 })
          board.react(note, 'idea', { key: 'g_0123456789abcdef', name: 'Heron', hue: 200 })
          board.react(note, 'plus-one', { key: 'g_fedcba9876543210', name: 'Otter', hue: 30 })
        }),
      )
      await page.locator('[data-testid="canvas"]').click({ position: { x: 520, y: 280 } })
      await page.getByTestId('reaction-bar').getByRole('button', { name: 'Agree' }).click()
      await expect(page.getByTestId('reaction-plus-one')).toHaveText(/3/)
      await snap(page, `${world}-reactions`)
    })

    test('the emoji library, searched', async ({ page }) => {
      await seedBoard(
        page,
        buildBoard((board) => {
          board.note('Customers do not understand pricing', { x: 520, y: 300 })
        }),
      )
      await page.locator('[data-testid="canvas"]').click({ position: { x: 520, y: 280 } })
      await page.getByTestId('react-more').click()
      await page.keyboard.type('heart')
      await expect(page.getByRole('button', { name: 'red heart', exact: true })).toBeVisible()
      await snap(page, `${world}-emoji-picker`)
    })

    // The session timer, paused part way, its sheet open on an editor's controls.
    test('the session timer', async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem(
          'openframe:guest',
          JSON.stringify({ name: 'Heron', hue: 2, key: 'g_0123456789abcdef' }),
        )
      })
      await page.clock.install()
      await openLocalBoard(page)
      await page.getByTestId('timer-button').click()
      await page.getByRole('button', { name: '3 minutes', exact: true }).click()
      await page.getByTestId('timer-start').click()
      await page.clock.runFor(10_000)
      await page.getByTestId('timer-pause').click()
      await expect(page.getByTestId('timer-readout')).toHaveText('2:50')
      await snap(page, `${world}-session-timer`)
    })

    // The session music, paused a few seconds in, its sheet open on an editor's controls,
    // with every genre offered — as the library offers them all.
    test('the session music', async ({ page }) => {
      await library(page, [
        ...TRACKS,
        ...MUSIC_GENRES.map((genre) => ({ id: `${genre}-1`, genre, title: 'Elsewhere' })),
      ])
      await page.clock.install()
      await openLocalBoard(page)
      await page.getByTestId('music-button').click()
      await page.getByRole('radio', { name: 'Ambient' }).click()
      await page.getByTestId('music-play').click()
      await page.clock.runFor(12_000)
      await page.getByTestId('music-pause').click()
      await expect(page.getByTestId('music-elapsed')).toHaveText('0:12 / 2:00')
      await snap(page, `${world}-session-music`)
    })

    // A poll with its results showing: one option picked here, one by someone else.
    test('a poll', async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem(
          'openframe:guest',
          JSON.stringify({ name: 'Heron', hue: 2, key: 'g_0123456789abcdef' }),
        )
      })
      await seedBoard(
        page,
        buildBoard((board) => {
          const poll = board.add(
            'poll',
            { x: 520, y: 300 },
            {
              text: [{ text: 'Which first?' }],
              options: [
                { id: 'o1', label: 'Show the price early' },
                { id: 'o2', label: 'Free returns' },
                { id: 'o3', label: 'Live chat' },
              ],
            },
          )
          board.answer(poll, 'o2', { key: 'g_otter', name: 'Otter', hue: 30 })
        }),
      )
      await page.getByTestId('poll-option-o2').click()
      await expect(page.getByTestId('poll-state')).toHaveText('2 people')
      await snap(page, `${world}-poll`)
    })

    // A round of dot voting, revealed, with its results open and a dot on the note.
    test('dot voting', async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem(
          'openframe:guest',
          JSON.stringify({ name: 'Heron', hue: 2, key: 'g_0123456789abcdef' }),
        )
      })
      await openLocalBoard(page)
      await placeSticky(page, 'Free returns')
      await page
        .locator('[data-testid="canvas"]')
        .click({ button: 'right', position: { x: 900, y: 600 } })
      await page.getByRole('menuitem', { name: 'Start dot voting…' }).click()
      await page.getByTestId('voting-title').fill('What first?')
      await page.getByTestId('voting-start').click()
      await page.locator('[data-testid="canvas"]').click({ position: { x: 520, y: 300 } })
      await page.locator('[data-testid="canvas"]').click({ position: { x: 520, y: 300 } })
      await expect(page.getByTestId('votes')).toHaveText('2')
      await page.getByTestId('voting-results').click()
      await snap(page, `${world}-dot-voting`)
    })

    // An uncoloured frame on the world's paper, with a note laid on it.
    test('a frame holding a note', async ({ page }) => {
      await openLocalBoard(page)
      await page.keyboard.press('f')
      // Centred low enough that its title, hung above it, clears the bar.
      await page.locator('[data-testid="canvas"]').click({ position: { x: 640, y: 380 } })
      await page.keyboard.type('Discovery')
      await page.keyboard.press('Escape')
      await expect(
        page.locator('[data-object-type="frame"]').getByRole('group', { name: 'Frame' }),
      ).toHaveCount(1)
      await placeSticky(page, 'Customers do not understand pricing')
      await page.keyboard.press('Escape')
      await snap(page, `${world}-frame`)
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

    test('a board this version cannot read', async ({ page }) => {
      await openLocalBoard(page)
      await placeSticky(page, 'Customers do not understand pricing')
      await rewriteStoredBoard(page, 'newer')
      await expect(page.getByTestId('board-unreadable')).toBeVisible()
      /*
       * Whether the focused button draws its ring depends on whether the last
       * input was a key, which a reload leaves to chance. A press on the
       * sheet's words settles it: a pointer user, no ring.
       */
      await page.getByTestId('board-unreadable').locator('p').click()
      await snap(page, `${world}-board-unreadable`)
    })

    test('a board deleted under you', async ({ page }) => {
      await signedIn(page, [])
      let room: WebSocketRoute | null = null
      await page.routeWebSocket(/\/room\//, (ws) => {
        room = ws
      })
      await page.goto(`/?room=${BOARD}&k=${KEY}`)
      await page.waitForSelector('[data-testid="status-bar"]')
      await expect.poll(() => room !== null).toBe(true)
      await (room as WebSocketRoute | null)?.close({ code: 4004, reason: 'This board was deleted' })
      await expect(page.getByTestId('board-gone')).toBeVisible()
      await snap(page, `${world}-board-gone`)
    })

    test('a notice, with a toast below it', async ({ page }) => {
      await openLocalBoard(page)
      await placeSticky(page, 'From the future')
      await rewriteStoredBoard(page, 'unknown-object')
      await page.locator('input[type="file"]').setInputFiles({
        name: 'not-really.png',
        mimeType: 'image/png',
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'),
      })
      await expect(page.getByTestId('toast')).toBeVisible()
      // Held by the pointer over its words, so the photograph is not a race
      // against its five seconds.
      await page.getByTestId('toast').getByTestId('toast-body').hover()
      await expect(page).toHaveScreenshot(`${world}-notice-and-toast.png`, {
        animations: 'disabled',
        caret: 'hide',
        threshold: 0.02,
      })
    })

    test('a board that would not open', async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(window, 'indexedDB', {
          configurable: true,
          value: {
            open() {
              throw new DOMException('The operation is insecure.', 'SecurityError')
            },
          },
        })
      })
      await page.goto(BOARD_URL)
      await expect(page.getByTestId('start-failed')).toBeVisible()
      await snap(page, `${world}-start-failed`)
    })

    /*
     * The splash, held still by an entry module that never arrives: the
     * artwork a tab sees first, and the quiet sheet every later load gets —
     * photographed with the watchdog's words and Reload on it, since the
     * sheet alone is one flat colour.
     */
    test('the splash, first load in a tab', async ({ page }) => {
      await page.route('**/main.tsx*', (route) => route.abort())
      await page.goto(BOARD_URL)
      await page.locator('#of-splash img[data-loaded="true"]').waitFor()
      await snap(page, `${world}-splash-artwork`)
    })

    test('the quiet splash, stalled', async ({ page }) => {
      await page.addInitScript(() => {
        sessionStorage.setItem('openframe:splash-seen', 'yes')
      })
      await page.clock.install()
      await page.route('**/main.tsx*', (route) => route.abort())
      await page.goto(BOARD_URL)
      await page.clock.fastForward(13_000)
      await page.locator('#of-splash button').waitFor()
      await snap(page, `${world}-splash-quiet-stalled`)
    })
  })
}
