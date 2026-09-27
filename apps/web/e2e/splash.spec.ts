import { expect, test } from '@playwright/test'

import { BOARD_URL, HOME_URL } from './routes.js'

/**
 * The boot splash must always END — in the board, in a failure panel, or at
 * the very least in a sentence that admits it is stuck.
 *
 * It sits at the top of the stacking order over an `inert` root, so a splash
 * that never goes is a page that cannot be used and does not say so (C3 #10).
 */

const SHARED = `/?room=brd_aaaaaaaa11111111&k=${'a'.repeat(32)}`

test('a room that fails while the board opens shows the failure, not the splash', async ({
  page,
}) => {
  // Throwing from the constructor rejects the connection before the first render.
  await page.addInitScript(() => {
    window.WebSocket = function refused() {
      throw new Error('refused')
    } as unknown as typeof WebSocket
  })
  await page.goto(SHARED)

  await expect(page.getByRole('alertdialog', { name: 'This board did not open' })).toBeVisible()
  await expect(page.locator('#of-splash')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reload' })).toBeFocused()
})

test('a splash that outlasts the watchdog says so, and offers a way out', async ({ page }) => {
  await page.clock.install()
  // The application never arrives: a network that drops the entry module.
  await page.route('**/main.tsx*', (route) => route.abort())
  await page.goto(BOARD_URL, { waitUntil: 'commit' })

  const splash = page.locator('#of-splash')
  await expect(splash).toBeVisible()
  await expect(splash).not.toContainText('Still opening')

  await page.clock.fastForward(13_000)
  await expect(splash).toContainText('Still opening')
  const reload = splash.getByRole('button', { name: 'Reload' })
  await expect(reload).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(reload).toBeFocused()
})

/**
 * The artwork is spent once per session (C3 #10). On a warm load the board is
 * ready in well under a second, so a two-second hold on EVERY page load was
 * pure waiting — paid again for every board opened from the front door.
 */
test.describe('once per session', () => {
  test.beforeEach(async ({ page }) => {
    // Production behaviour: the suite's shortcut off.
    await page.addInitScript(() => {
      localStorage.removeItem('openframe:splash-hold')
    })
  })

  test('the second load in a tab is a quiet sheet in the world, and is not held', async ({
    page,
  }) => {
    await page.goto(BOARD_URL)
    await expect(page.locator('#of-splash')).toHaveCount(0, { timeout: 8_000 })

    // Held on screen by the entry module, to look at what the second load paints.
    await page.route('**/main.tsx*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.continue()
    })
    await page.goto(HOME_URL, { waitUntil: 'commit' })
    const splash = page.locator('#of-splash')
    await expect(splash).toBeVisible()
    await expect(splash).toHaveCSS('background-color', 'rgb(247, 249, 251)')
    await expect(splash).toHaveCSS('background-image', 'none')
    await expect(splash.locator('img')).toBeHidden()
    await expect(splash.locator('p')).toBeHidden()

    // Gone as soon as the page is, rather than at two seconds.
    await page.getByTestId('home').waitFor()
    const ready = await page.evaluate(() => performance.now())
    await expect(splash).toHaveCount(0, { timeout: 1_000 })
    expect(ready).toBeLessThan(2_000 + 1_500)
  })

  test('the quiet sheet is drawn in After Hours for somebody who chose it', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('openframe:theme', 'after-hours')
    })
    await page.goto(BOARD_URL)
    await expect(page.locator('#of-splash')).toHaveCount(0, { timeout: 8_000 })

    await page.route('**/main.tsx*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.continue()
    })
    await page.goto(HOME_URL, { waitUntil: 'commit' })
    await expect(page.locator('#of-splash')).toHaveCSS('background-color', 'rgb(27, 16, 51)')
  })

  test('a new session sees the artwork again', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.addInitScript(() => {
      localStorage.removeItem('openframe:splash-hold')
    })
    await page.goto(BOARD_URL)
    await page.getByTestId('status-bar').waitFor()
    // Held: the board is ready and the artwork is still up.
    await expect(page.locator('#of-splash img')).toBeVisible()
    await context.close()
  })
})
