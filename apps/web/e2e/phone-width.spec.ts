import { expect, test, type Page } from '@playwright/test'
import { richFromPlain } from '@openframe/core'
import { buildBoard } from './boards.js'
import { boxOf, CANVAS, goto, reload, seedBoard } from './fixtures.js'
import { library, TRACKS } from './music.js'

import { BOARD_URL, HOME_URL } from './routes.js'
import { signedIn } from './signed-in.js'

/**
 * A phone-width window (C3 #9).
 *
 * Measured before: the signed-in front door was 480px wide on a 390px screen,
 * so it scrolled sideways; the board's bar ran off both edges, clipping the
 * account and the AGPL source link; a row's confirmation collapsed to one word
 * per line; and `user-scalable=no` stopped anybody zooming the page at all.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

const BOARDS = [
  {
    id: 'brd_aaaaaaaaaaaaaaaa',
    title: 'Pricing research, September round',
    role: 'owner' as const,
  },
  { id: 'brd_bbbbbbbbbbbbbbbb', title: 'Checkout interviews', role: 'owner' as const },
]

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

test('the front door does not scroll sideways', async ({ page }) => {
  await signedIn(page, BOARDS, 'Muqtadaa Miandara', {
    mentions: [
      {
        commentId: 'cmt_1',
        boardId: 'brd_bbbbbbbbbbbbbbbb',
        boardTitle: 'Checkout interviews',
        authorName: 'Sam Rivera',
        body: '@Muqtadaa can you check P07?',
      },
    ],
  })
  await goto(page, HOME_URL)
  await page.waitForSelector('[data-testid="home-boards"] li')
  expect(await overflow(page)).toBeLessThanOrEqual(0)
})

test('a board is named in full and dated on one line', async ({ page }) => {
  // At 390 the name was cut at about sixteen characters and "an hour ago"
  // stood in a column one word wide, three lines tall (audit 2026-09-27).
  await signedIn(page, [
    ...BOARDS,
    { id: 'brd_cccccccccccccccc', title: 'Q4 roadmap', role: 'viewer' as const },
  ])
  await goto(page, HOME_URL)
  await page.waitForSelector('[data-testid="home-boards"] li')

  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="board-link"]')].map((row) => {
      const title = row.querySelector<HTMLElement>('[data-testid="board-title-text"]')
      const when = row.querySelector<HTMLElement>('[data-testid="board-when"]')
      // One rect per line the words occupy.
      const range = document.createRange()
      if (when !== null) range.selectNodeContents(when)
      const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)))
      return {
        text: title?.textContent ?? '',
        clipped:
          title === null ||
          title.scrollWidth > title.clientWidth + 1 ||
          title.scrollHeight > title.clientHeight + 1,
        whenLines: lines.size,
        // And the actions, on the same row, never lie over the time.
        overlaps: (() => {
          const time = when?.getBoundingClientRect()
          const actions = row.parentElement
            ?.querySelector('[data-testid="board-row-actions"]')
            ?.getBoundingClientRect()
          if (time === undefined || actions === undefined) return false
          return (
            time.right > actions.left &&
            time.left < actions.right &&
            time.bottom > actions.top &&
            time.top < actions.bottom
          )
        })(),
      }
    }),
  )
  expect(rows.length).toBe(3)
  // Not vacuous: the longest name is longer than what used to fit.
  expect(rows.some((row) => row.text.length > 30)).toBe(true)
  for (const row of rows) {
    expect(row.clipped, row.text).toBe(false)
    expect(row.whenLines, row.text).toBe(1)
    expect(row.overlaps, row.text).toBe(false)
  }
})

test('a confirmation reads as a sentence, inside the screen', async ({ page }) => {
  await signedIn(page, BOARDS)
  await goto(page, HOME_URL)
  const row = page.getByTestId('home-boards').locator('li').first()
  await row.getByTestId('delete-board').click()
  const what = row.getByTestId('board-confirm-what')
  const box = await boxOf(what)
  expect(box.width).toBeGreaterThan(250)
  expect(await overflow(page)).toBeLessThanOrEqual(0)
})

test("the board's bar fits, with the account as a face", async ({ page }) => {
  await signedIn(page, [])
  await goto(page, BOARD_URL)
  await page.waitForSelector('[data-testid="status-bar"]')
  const bar = await boxOf(page.getByTestId('status-bar'))
  expect(bar.x).toBeGreaterThanOrEqual(0)
  expect(bar.x + bar.width).toBeLessThanOrEqual(390)

  const account = page.getByTestId('account')
  const chip = await boxOf(account)
  expect(chip.x + chip.width).toBeLessThanOrEqual(390)
  await expect(account.getByTestId('status-label')).toBeHidden()
})

/*
 * Signed out, the label IS the button (audit 2026-09-27). The rule that
 * shrinks the account to its face hid it here too, leaving a 16px invisible
 * button.
 */
test('signed out, the bar still says Sign in', async ({ page }) => {
  await goto(page, BOARD_URL)
  await page.waitForSelector('[data-testid="status-bar"]')
  const signIn = page.getByTestId('sign-in')
  await expect(signIn).toHaveText('Sign in')
  await expect(signIn.getByTestId('status-label')).toBeVisible()
  const box = await boxOf(signIn)
  expect(box.width).toBeGreaterThanOrEqual(30)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
})

test('the page can be zoomed', async ({ page }) => {
  await goto(page, HOME_URL)
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
  expect(viewport).not.toMatch(/user-scalable\s*=\s*no/)
  expect(viewport).not.toMatch(/maximum-scale\s*=\s*1(\.0)?\b/)
})

/*
 * A narrow DESKTOP window too, not only a phone. With a pointer, hidden tips
 * are still laid out; the front door's hung off its right edge and made the
 * page 480px wide even though every visible thing fitted.
 */
test.describe('a narrow window with a mouse', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: false, isMobile: false })

  test('the front door does not scroll sideways', async ({ page }) => {
    await signedIn(page, BOARDS, 'Muqtadaa Miandara', {
      mentions: [
        {
          commentId: 'cmt_1',
          boardId: 'brd_bbbbbbbbbbbbbbbb',
          boardTitle: 'Checkout interviews',
          authorName: 'Sam Rivera',
          body: '@Muqtadaa can you check P07?',
        },
      ],
    })
    await goto(page, HOME_URL)
    await page.waitForSelector('[data-testid="home-boards"] li')
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })

  /*
   * Undo and redo joined the zoom cluster, and at this width it then ran to
   * the window's edge: the gutter every other floating thing keeps was gone.
   */
  test('the zoom cluster keeps its gutter', async ({ page }) => {
    await goto(page, BOARD_URL)
    const cluster = page.getByTestId('zoom-control')
    await expect(cluster.getByTestId('undo')).toBeVisible()
    const box = await cluster.boundingBox()
    expect(box?.x).toBeGreaterThanOrEqual(20)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(370)
    // Named still, with its caption gone.
    await expect(page.getByTestId('wheel-mode')).toHaveAccessibleName(/Scroll wheel/)
  })

  /*
   * Looking at an earlier version, the bar that says so held its date, Restore
   * and Back to now on one line, and on a phone ran off the right edge with
   * the way back on it.
   */
  test('the version bar wraps rather than running off the screen', async ({ page }) => {
    await page.clock.install()
    await goto(page, BOARD_URL)
    await page.waitForSelector('[data-testid="status-bar"]')
    // By hand: `place` clicks away at a point off a phone's screen.
    await page.keyboard.press('s')
    await page.locator(CANVAS).click({ position: { x: 240, y: 400 } })
    await page.keyboard.type('Kept for later')
    await page.keyboard.press('Escape')
    await page.clock.runFor(121_000)
    await page.getByTestId('board-menu').click()
    await page.getByTestId('board-menu-history').click()
    await page.getByTestId('history-version').first().click()
    const bar = await boxOf(page.getByTestId('version-preview'))
    expect(bar.x).toBeGreaterThanOrEqual(0)
    expect(bar.x + bar.width).toBeLessThanOrEqual(390)
    for (const id of ['version-restore', 'version-back']) {
      const control = await boxOf(page.getByTestId(id))
      expect(control.x + control.width, id).toBeLessThanOrEqual(390)
    }
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })
})

/*
 * The comments panel on a phone (audit 2026-09-27): a 300px card pinned
 * under the bar sat across the rail and over Find when both were open, and
 * measured its height from `100vh`, which on a phone includes the browser's
 * own bar. It is a sheet along the bottom here, like the record panel.
 */
test('the comments panel is a sheet along the bottom, clear of Find', async ({ page }) => {
  await signedIn(page, [{ id: 'brd_abcdefgh12345678', title: 'Shared', role: 'owner' }])
  await page.routeWebSocket(/\/room\//, () => undefined)
  await goto(page, `/?room=brd_abcdefgh12345678&k=${'e'.repeat(32)}`)
  await page.waitForSelector('[data-testid="status-bar"]')
  await page.getByTestId('tool-comment').click()
  const panel = page.getByTestId('comment-panel')
  await expect(panel).toBeVisible()

  const box = await boxOf(panel)
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(843)
  expect(box.height).toBeLessThanOrEqual(844 * 0.6 + 1)

  await page.keyboard.press('Control+f')
  const find = await boxOf(page.getByTestId('search-panel'))
  expect(find.y + find.height).toBeLessThanOrEqual(box.y)
})

/*
 * Targets for a finger (audit 2026-09-27). Nothing grew for a coarse pointer:
 * most of the chrome was 30px — the secondary-control floor for a mouse — and
 * the workspace tabs were 26px tall, under even that. On a touch screen the
 * secondary floor is the product's operating size, 40.
 */
test('a finger gets 40px targets on the board', async ({ page }) => {
  await goto(page, BOARD_URL)
  await page.waitForSelector('[data-testid="status-bar"]')
  await page.getByTestId('tool-sticky').tap()
  await page.locator('[data-testid="canvas"]').tap({ position: { x: 200, y: 220 } })
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('inspector')).toBeVisible()
  for (const id of ['zoom-in', 'zoom-out', 'zoom-fit', 'undo', 'board-menu', 'inspector-delete']) {
    const box = await page.getByTestId(id).boundingBox()
    expect(box?.width, id).toBeGreaterThanOrEqual(40)
    expect(box?.height, id).toBeGreaterThanOrEqual(40)
  }
  // And the bar still fits the phone.
  const bar = await page.getByTestId('status-bar').boundingBox()
  expect((bar?.x ?? 0) + (bar?.width ?? 0)).toBeLessThanOrEqual(390)
})

test('the workspace tabs are a target, not a label', async ({ page }) => {
  await signedIn(page, BOARDS)
  await goto(page, HOME_URL)
  const tab = page.getByTestId('workspace-all')
  await expect(tab).toBeVisible()
  const box = await tab.boundingBox()
  expect(box?.height).toBeGreaterThanOrEqual(40)
})

/*
 * Version history is in the menu beside the board's name at every width. It
 * used to have a button of its own that a phone's bar had no room for, so
 * there it moved into the account sheet — two places to look for one thing.
 */
test('version history is in the board’s menu at phone width too', async ({ page }) => {
  await goto(page, BOARD_URL)
  await page.waitForSelector('[data-testid="status-bar"]')
  await page.getByTestId('board-menu').click()
  await page.getByTestId('board-menu-history').click()
  await expect(page.getByTestId('history-surface').getByRole('status')).toHaveText(
    'No earlier versions yet.',
  )
})

/*
 * Every surface the newer features open, walked at 390 (PR 3 critique,
 * 2026-10-07). Below 520 they dock to the edges: a surface is inside the
 * screen, it never lies over the rail, and what it does not cover still takes
 * a press. Measured before: the voting banner and its results blocked the
 * notes under them, the rail lay over the overview and the sheets, the
 * reaction bar ran off the right edge, the record panel covered the poll's
 * Close, and the version bar overflowed.
 */
test.describe('surfaces at phone width', () => {
  interface Box {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }

  const meets = (a: Box, b: Box): boolean =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

  async function docked(page: Page, testId: string): Promise<Box> {
    const box = await boxOf(page.getByTestId(testId))
    expect(box.x, `${testId} left`).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width, `${testId} right`).toBeLessThanOrEqual(390)
    expect(box.y + box.height, `${testId} bottom`).toBeLessThanOrEqual(844)
    const rail = await boxOf(page.getByRole('toolbar', { name: 'Board tools' }))
    expect(meets(box, rail), `${testId} over the rail`).toBe(false)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    // Its CONTENTS too: a wrapper held to the room beside the rail said
    // nothing about the 300px sheet inside it, which ran on regardless (Codex,
    // on #91).
    const furthest = await page
      .getByTestId(testId)
      .evaluate((element) =>
        Math.max(
          ...[element, ...element.querySelectorAll('*')].map(
            (each) => each.getBoundingClientRect().right,
          ),
        ),
      )
    expect(furthest, `${testId} contents`).toBeLessThanOrEqual(390)
    return box
  }

  const notes = buildBoard((board) => {
    board.note('Show the price early', { x: 220, y: 420 })
    board.note('Free returns', { x: 220, y: 640 })
  })

  test('the voting setup and banner sit beside the rail', async ({ page }) => {
    await seedBoard(page, notes)
    await page.locator(CANVAS).click({ button: 'right', position: { x: 360, y: 530 } })
    await page.getByRole('menuitem', { name: 'Start dot voting…' }).click()
    await docked(page, 'voting-setup')
    await page.getByTestId('voting-start').click()
    const banner = await docked(page, 'voting')
    // The note under the top of the board still takes a vote.
    const note = await boxOf(page.locator('[data-object-type="sticky"]').first())
    expect(meets(banner, note)).toBe(false)
  })

  /*
   * One line on a phone (owner, 10-09): the round's title, what you have
   * left and the Vote switch, with Reveal, Results, End and Clear in a menu.
   * Wrapped over three rows it covered the top of the board, and a tap there
   * landed on the banner rather than on a note.
   */
  test('the voting banner is one line, with the rest in its menu', async ({ page }) => {
    await seedBoard(page, notes)
    await page.locator(CANVAS).click({ button: 'right', position: { x: 360, y: 530 } })
    await page.getByRole('menuitem', { name: 'Start dot voting…' }).click()
    await page.getByTestId('voting-hidden').check()
    await page.getByTestId('voting-start').click()
    // One line: no taller than one row of finger-sized controls and its edge.
    const row = (await boxOf(page.getByTestId('voting-vote'))).height
    expect((await docked(page, 'voting')).height).toBeLessThan(2 * row)
    await expect(page.getByTestId('voting-end')).toHaveCount(0)
    await expect(page.getByTestId('voting-status')).toHaveText('5 of 5 left')
    await page.getByTestId('voting-more').click()
    await expect(page.getByTestId('voting-more-heading')).toHaveText('Dot voting')
    await expect(page.getByRole('menuitemcheckbox', { name: 'Take back dots' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Reveal' })).toBeVisible()
    await page.getByRole('menuitem', { name: 'End' }).click()
    await expect(page.getByTestId('voting-status')).toHaveText('Voting ended')
    await expect(page.getByTestId('voting-more')).toBeFocused()
    expect((await docked(page, 'voting')).height).toBeLessThan(2 * row)
  })

  test('the board overview starts after the rail', async ({ page }) => {
    await seedBoard(page, notes)
    await page.locator(CANVAS).focus()
    await page.keyboard.press('Alt+s')
    await docked(page, 'board-overview')
  })

  test('the session sheet starts after the rail', async ({ page }) => {
    await goto(page, BOARD_URL)
    await page.waitForSelector('[data-testid="status-bar"]')
    await page.getByTestId('session-button').click()
    await expect(page.getByTestId('timer-start')).toBeVisible()
    await docked(page, 'session-surface')
  })

  test('the account sheet starts after the rail, and fits', async ({ page }) => {
    await goto(page, BOARD_URL)
    await page.waitForSelector('[data-testid="status-bar"]')
    await page.getByTestId('sign-in').click()
    await docked(page, 'account-surface')
  })

  test('the reaction bar stays on the screen', async ({ page }) => {
    await seedBoard(
      page,
      buildBoard((board) => {
        board.note('Near the right edge', { x: 300, y: 420 })
      }),
    )
    await page.locator(CANVAS).click({ position: { x: 300, y: 420 } })
    const bar = await docked(page, 'reaction-bar')
    const panel = await boxOf(page.getByTestId('inspector'))
    expect(meets(bar, panel)).toBe(false)
  })

  test('a selection with no record panel is not moved', async ({ page }) => {
    await seedBoard(
      page,
      buildBoard((board) => {
        const group = board.add('group', { x: 0, y: 0 })
        board.add('sticky', { x: 220, y: 700 }, { text: richFromPlain('Low') }, undefined, group)
        board.add('sticky', { x: 300, y: 700 }, { text: richFromPlain('Down') }, undefined, group)
      }),
    )
    const before = await boxOf(page.locator('[data-object-type="sticky"]').first())
    await page.locator(CANVAS).click({ position: { x: 220, y: 700 } })
    await expect(page.getByTestId('selection-overlay')).toBeVisible()
    await expect(page.getByTestId('inspector')).toHaveCount(0)
    const after = await boxOf(page.locator('[data-object-type="sticky"]').first())
    expect(after.y).toBe(before.y)
  })

  test("the record panel leaves the poll's Close in reach", async ({ page }) => {
    await seedBoard(
      page,
      buildBoard((board) => {
        board.add('poll', { x: 220, y: 560 }, { text: [{ text: 'Cats or dogs?' }] })
      }),
    )
    await page.locator('[data-object-type="poll"]').getByTestId('poll-question').click()
    await expect(page.getByTestId('inspector')).toBeVisible()
    const close = page.getByTestId('poll-close')
    const box = await boxOf(close)
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid="poll-close"]') !== null,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    )
    expect(hit).toBe(true)
  })
})

/*
 * Under a finger, where every control is 40px, on the two widths phones come
 * in (audit 2026-10-08). Measured before: undo sat off the left edge at 390
 * and undo and redo were both gone at 320; the arrange bar's distribute
 * buttons ran past the window; the listen prompt's Dismiss was 15px on screen
 * at 390 and none at 320. Nothing on a phone is reachable only by scrolling a
 * window that does not scroll.
 */
for (const width of [390, 320]) {
  test.describe(`under a finger, ${String(width)}px wide`, () => {
    test.use({ viewport: { width, height: 760 }, hasTouch: true, isMobile: true })

    async function onScreen(page: Page, testId: string): Promise<void> {
      const box = await boxOf(page.getByTestId(testId))
      expect(box.x, `${testId} left edge`).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, `${testId} right edge`).toBeLessThanOrEqual(width)
    }

    test('the bar’s way out and Share are a finger wide', async ({ page }) => {
      // Signed in, on a shared board: the bar at its fullest, with Share on it.
      await signedIn(page, [{ id: 'brd_abcdefgh12345678', title: 'Shared', role: 'owner' }])
      await page.routeWebSocket(/\/room\//, () => undefined)
      await goto(page, `/?room=brd_abcdefgh12345678&k=${'e'.repeat(32)}`)
      await page.waitForSelector('[data-testid="status-bar"]')
      for (const id of ['board-exit', 'share-board']) {
        const box = await boxOf(page.getByTestId(id))
        expect(box.width, id).toBeGreaterThanOrEqual(40)
        expect(box.height, id).toBeGreaterThanOrEqual(40)
      }
    })

    test('undo and redo stay on screen', async ({ page }) => {
      await goto(page, BOARD_URL)
      await expect(page.getByTestId('undo')).toBeAttached()
      await onScreen(page, 'undo')
      await onScreen(page, 'redo')
      await onScreen(page, 'zoom-control')
    })

    test('every arrange control stays on screen', async ({ page }) => {
      await goto(page, BOARD_URL)
      await seedBoard(
        page,
        buildBoard((board) => {
          board.note('One', { x: 80, y: 300 })
          board.note('Two', { x: 160, y: 420 })
          board.note('Three', { x: 240, y: 540 })
        }),
      )
      await page.locator(CANVAS).focus()
      await page.keyboard.press('ControlOrMeta+a')
      await expect(page.getByTestId('arrange-bar')).toBeVisible()
      for (const axis of ['x', 'y']) await onScreen(page, `distribute-${axis}`)
      await onScreen(page, 'arrange-bar')
    })

    test('the listen prompt stays on screen', async ({ page }) => {
      await goto(page, BOARD_URL)
      await library(page, TRACKS)
      await page.evaluate(() => {
        const now = Date.now()
        window.localStorage.setItem(
          'openframe:music:board_local',
          JSON.stringify({
            v: 1,
            genre: 'jazzhop',
            status: 'playing',
            anchor: now,
            pausedAtMs: 0,
            playlist: [{ id: 'jazzy-1', durationMs: 120_000 }],
            run: 1,
            by: 'Ada',
            startedBy: 'Ada',
            at: now,
          }),
        )
      })
      await reload(page)
      await expect(page.getByTestId('music-prompt')).toBeVisible()
      await onScreen(page, 'music-prompt-listen')
      await onScreen(page, 'music-prompt-dismiss')
    })
  })
}
