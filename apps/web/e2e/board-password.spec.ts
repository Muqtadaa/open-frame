import { expect, test, type Page } from '@playwright/test'

import { signedIn } from './signed-in.js'

const KEY = 'e'.repeat(32)
const TOKEN = 'c'.repeat(32)
const BOARD = 'brd_abcdefgh12345678'

/**
 * A board whose room refuses the connection until the password is redeemed.
 *
 * The room closes with 4003 instead of sending any of the board — a distinct
 * code, because a refused upgrade reaches the browser as a generic 1006 that
 * cannot be told apart from a dropped connection, and "your wifi blinked" is
 * the wrong thing to tell somebody who needs to type a password.
 */
async function lockedRoom(page: Page, opens: { with: string }): Promise<string[]> {
  const sockets: string[] = []
  await page.routeWebSocket(/\/room\//, (ws) => {
    const url = ws.url()
    sockets.push(url)
    // Turned away without the token OR the owner key, exactly as the room is:
    // the owner is never challenged on their own board.
    const owner = url.includes(`o=${'d'.repeat(32)}`)
    if (!owner && !url.includes(`t=${opens.with}`)) {
      void ws.close({ code: 4003, reason: 'This board needs its password' })
    }
  })
  return sockets
}

test('asks for the password instead of looking like a broken connection', async ({ page }) => {
  await signedIn(page, [])
  await lockedRoom(page, { with: TOKEN })

  await page.goto(`/?room=${BOARD}&k=${KEY}`)

  const locked = page.getByTestId('board-locked')
  await expect(locked).toBeVisible()
  await expect(locked).toContainText('This board has a password')
  // Not the connection notice, and not dismissible.
  await expect(locked.getByRole('button', { name: /dismiss/i })).toHaveCount(0)
})

test('says the password was wrong, and keeps asking', async ({ page }) => {
  await signedIn(page, [])
  await lockedRoom(page, { with: TOKEN })

  await page.route('**/room/*/unlock', async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'That is not the password' }),
    })
  })

  await page.goto(`/?room=${BOARD}&k=${KEY}`)
  await expect(page.getByTestId('board-locked')).toBeVisible()

  await page.getByTestId('board-password').fill('not it')
  await page.getByTestId('board-unlock').click()

  await expect(page.getByTestId('board-password-problem')).toContainText('not the password')
  // Still asking, and the field is cleared rather than left holding a wrong
  // guess for somebody to press again.
  await expect(page.getByTestId('board-locked')).toBeVisible()
  await expect(page.getByTestId('board-password')).toHaveValue('')
})

/**
 * The right password, and what the browser does with what it gets back.
 *
 * The token is what "remembered on this browser" means, and it must reach the
 * SOCKET — a token the room mints and the client never presents is the whole
 * feature failing silently.
 */
test('remembers the token and reconnects with it', async ({ page }) => {
  await signedIn(page, [])
  const sockets = await lockedRoom(page, { with: TOKEN })

  let asked: unknown = null
  await page.route('**/room/*/unlock', async (route) => {
    asked = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: TOKEN }),
    })
  })

  await page.goto(`/?room=${BOARD}&k=${KEY}`)
  await expect(page.getByTestId('board-locked')).toBeVisible()

  await page.getByTestId('board-password').fill('open sesame')
  await page.getByTestId('board-unlock').click()

  // The prompt goes because the page reloads and the board opens.
  await expect(page.getByTestId('board-locked')).toHaveCount(0)

  // BOTH factors were sent: the room checks the link before the password, so
  // that somebody without the link learns nothing about whether a board is
  // protected.
  expect(asked).toEqual({ key: KEY, password: 'open sesame' })

  await expect.poll(() => sockets.some((url) => url.includes(`t=${TOKEN}`))).toBe(true)
  await expect(page.getByTestId('board-locked')).toHaveCount(0)
})

/**
 * The owner is never asked for their own board's password.
 *
 * A board that locks out the person whose board it is — on a new machine, or
 * after they have forgotten what they set — is a board they have lost. The
 * owner key is what excuses them, and it is not a link: it lives in a column
 * only its owner can read and travels beside the edit link on the socket.
 *
 * This opens the board by DEEP LINK on a browser that has never loaded the
 * board list, which is the case the cache cannot cover: nothing is stored
 * locally, so the key has to be recovered from the account before the prompt
 * would otherwise appear.
 */
test('lets the owner straight in, without ever asking', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Mine', role: 'owner' }])
  const sockets = await lockedRoom(page, { with: TOKEN })

  await page.goto(`/?room=${BOARD}&k=${KEY}`)
  await page.waitForSelector('[data-testid="status-bar"]')

  // `signed-in.ts` hands an owner 'd' * 32, exactly as `my_boards()` hands
  // back the column for an owner and null for everybody else.
  await expect.poll(() => sockets.some((url) => url.includes(`o=${'d'.repeat(32)}`))).toBe(true)

  // Never asked. Not a prompt that appears and is dismissed — one that is
  // never shown, because the board opens instead.
  await expect(page.getByTestId('board-locked')).toHaveCount(0)
  await expect(page.getByTestId('board-password')).toHaveCount(0)
})

/**
 * And the owner key is never put in a link.
 *
 * Were it accepted as `k`, it would sit in the page URL — and a URL copied out
 * of the address bar and passed to somebody would carry the board's password
 * with it, which is the one thing the password exists to prevent.
 */
test('never puts the owner key in the page URL', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Mine', role: 'owner' }])
  await lockedRoom(page, { with: TOKEN })

  await page.goto(`/?room=${BOARD}&k=${KEY}`)
  await page.waitForSelector('[data-testid="status-bar"]')
  await expect(page.getByTestId('board-locked')).toHaveCount(0)

  expect(page.url()).not.toContain('d'.repeat(32))
  expect(page.url()).toContain(`k=${KEY}`)
})

/**
 * The gate is the only thing on the page.
 *
 * It was an unnamed dialog over a live board: it announced as "dialog" and
 * nothing more, Tab walked out of it into the rail behind the scrim, and a
 * wrong password disabled the field mid-press, which threw the keyboard onto
 * the page body.
 */
test.describe('as a dialog', () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page, [])
    await lockedRoom(page, { with: TOKEN })
    await page.route('**/room/*/unlock', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'That is not the password' }),
      })
    })
    await page.goto(`/?room=${BOARD}&k=${KEY}`)
    await expect(page.getByTestId('board-locked')).toBeVisible()
  })

  test('is named by what it asks, and holds the keyboard', async ({ page }) => {
    const gate = page.getByRole('alertdialog', { name: 'This board has a password' })
    await expect(gate).toBeVisible()
    await expect(gate).toHaveAccessibleDescription(/Ask whoever sent it/)
    await expect(page.getByTestId('board-password')).toBeFocused()

    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      const inside = await page.evaluate(
        () => document.activeElement?.closest('[data-testid="board-locked"]') !== null,
      )
      expect(inside).toBe(true)
    }
    // Behind it, nothing answers: the bar and the rail are inert.
    const inert = await page
      .getByTestId('status-bar')
      .evaluate((element) => element.closest('[inert]') !== null)
    expect(inert).toBe(true)
  })

  test('puts the keyboard back in the field after a wrong password, and says why', async ({
    page,
  }) => {
    await page.getByTestId('board-password').fill('not it')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('board-password-problem')).toBeVisible()

    const field = page.getByTestId('board-password')
    await expect(field).toBeFocused()
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    await expect(field).toHaveAccessibleDescription(/not the password/)
  })

  test('has a way out that is not the password', async ({ page }) => {
    await expect(page.getByTestId('board-locked-exit')).toHaveAttribute('href', '/')
    await expect(page.getByTestId('board-locked-exit')).toHaveText('All boards')
  })
})
