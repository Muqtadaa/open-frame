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
    // Anything without the right token is turned away, exactly as the room does.
    if (!url.includes(`t=${opens.with}`)) {
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
