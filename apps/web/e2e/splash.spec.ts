import { expect, test } from '@playwright/test'

import { BOARD_URL } from './routes.js'

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
