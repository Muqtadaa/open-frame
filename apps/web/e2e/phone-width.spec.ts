import { expect, test, type Page } from '@playwright/test'

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
  await page.goto(HOME_URL)
  await page.waitForSelector('[data-testid="home-boards"] li')
  expect(await overflow(page)).toBeLessThanOrEqual(0)
})

test('a confirmation reads as a sentence, inside the screen', async ({ page }) => {
  await signedIn(page, BOARDS)
  await page.goto(HOME_URL)
  const row = page.getByTestId('home-boards').locator('li').first()
  await row.getByTestId('delete-board').click()
  const what = row.locator('.of-home__confirm-what')
  const box = await what.boundingBox()
  if (box === null) throw new Error('no confirmation')
  expect(box.width).toBeGreaterThan(250)
  expect(await overflow(page)).toBeLessThanOrEqual(0)
})

test("the board's bar fits, with the account as a face and the source in its sheet", async ({
  page,
}) => {
  await signedIn(page, [])
  await page.goto(BOARD_URL)
  await page.waitForSelector('[data-testid="status-bar"]')
  const bar = await page.getByTestId('status-bar').boundingBox()
  if (bar === null) throw new Error('no bar')
  expect(bar.x).toBeGreaterThanOrEqual(0)
  expect(bar.x + bar.width).toBeLessThanOrEqual(390)

  const account = page.getByTestId('account')
  const chip = await account.boundingBox()
  if (chip === null) throw new Error('no account')
  expect(chip.x + chip.width).toBeLessThanOrEqual(390)
  await expect(account.locator('.of-status__share-label')).toBeHidden()

  // Reachable from inside the running app (AGPL §13), from the account.
  await expect(page.getByTestId('source-link')).toBeHidden()
  await account.click()
  await expect(
    page.getByTestId('account-sheet').getByRole('link', { name: 'Source' }),
  ).toBeVisible()
})

/*
 * Signed out, the label IS the button (audit 2026-09-27). The rule that
 * shrinks the account to its face hid it here too, leaving a 16px invisible
 * button — and the source link, whose other home is that button's sheet.
 */
test('signed out, the bar still says Sign in, and the source is behind it', async ({ page }) => {
  await page.goto(BOARD_URL)
  await page.waitForSelector('[data-testid="status-bar"]')
  const signIn = page.getByTestId('sign-in')
  await expect(signIn).toHaveText('Sign in')
  await expect(signIn.locator('.of-status__share-label')).toBeVisible()
  const box = await signIn.boundingBox()
  if (box === null) throw new Error('no sign in')
  expect(box.width).toBeGreaterThanOrEqual(30)
  expect(box.x + box.width).toBeLessThanOrEqual(390)

  await signIn.click()
  await expect(
    page.getByTestId('account-dialog').getByRole('link', { name: 'Source' }),
  ).toBeVisible()
})

test('the page can be zoomed', async ({ page }) => {
  await page.goto(HOME_URL)
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
    await page.goto(HOME_URL)
    await page.waitForSelector('[data-testid="home-boards"] li')
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
  await page.goto(`/?room=brd_abcdefgh12345678&k=${'e'.repeat(32)}`)
  await page.waitForSelector('[data-testid="status-bar"]')
  await page.getByTestId('tool-comment').click()
  const panel = page.getByTestId('comment-panel')
  await expect(panel).toBeVisible()

  const box = await panel.boundingBox()
  if (box === null) throw new Error('no panel')
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(843)
  expect(box.height).toBeLessThanOrEqual(844 * 0.6 + 1)

  await page.keyboard.press('Control+f')
  const find = await page.getByTestId('search-panel').boundingBox()
  if (find === null) throw new Error('no search')
  expect(find.y + find.height).toBeLessThanOrEqual(box.y)
})
