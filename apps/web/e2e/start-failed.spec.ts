import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL, HOME_URL } from './routes.js'

/**
 * OpenFrame cannot reach this browser's storage at all.
 *
 * Private windows in some browsers, a profile with site data blocked, a disk
 * that is full. A board that failed to open used to leave the splash up with
 * one small line across the artwork, and the front door said "Looking for
 * your boards…" forever.
 */
async function storageRefused(page: Page): Promise<void> {
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
}

test('a board that cannot open says why, that nothing was lost, and what to do', async ({
  page,
}) => {
  await storageRefused(page)
  await page.goto(BOARD_URL)

  const gate = page.getByRole('alertdialog', { name: 'This board did not open' })
  await expect(gate).toBeVisible()
  await expect(gate).toContainText('private')
  await expect(gate).toContainText('Your boards on this device are unchanged.')
  await expect(page.getByRole('button', { name: 'Reload' })).toBeFocused()
  await expect(gate.getByRole('link', { name: 'All boards' })).toHaveAttribute('href', '/')
  // Not over the artwork: the splash has gone.
  await expect(page.locator('#of-splash')).toHaveCount(0)
})

test('the front door says it could not list the boards, instead of looking forever', async ({
  page,
}) => {
  await storageRefused(page)
  await page.goto(HOME_URL)

  const problem = page.getByTestId('home-list-problem')
  await expect(problem).toBeVisible()
  await expect(problem).toContainText('could not be listed')
  await expect(page.getByText('Looking for your boards…')).toHaveCount(0)
})
