import type { Page } from '@playwright/test'

import { expect, test } from './fixtures.js'
import { library, TRACKS } from './music.js'

/**
 * Session music (ADR 0017): one playlist, at the same place on every device.
 * The rooms suite plays it between two browsers; here, one person on a board
 * that is nobody else's, with a stand-in library.
 */

test.use({ board: 'fresh' })

const button = (page: Page) => page.getByTestId('music-button')
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Music' })

async function withLibrary(page: Page, tracks = TRACKS): Promise<void> {
  await library(page, tracks)
  await page.reload()
  await page.waitForSelector('[data-testid="status-bar"]')
}

test('offers no music where there is no library to play from', async ({ page }) => {
  await library(page, null)
  await page.reload()
  await page.waitForSelector('[data-testid="status-bar"]')
  await expect(page.getByTestId('timer-button')).toBeVisible()
  await expect(button(page)).toHaveCount(0)
})

test('plays a genre, and pauses and stops it', async ({ page }) => {
  await withLibrary(page)
  await button(page).click()
  await sheet(page).getByRole('radio', { name: 'Jazz lounge' }).click()
  await expect(sheet(page).getByRole('radio', { name: 'Jazz lounge' })).toHaveAttribute(
    'aria-checked',
    'true',
  )

  const fetched = page.waitForRequest('**/music/track/jazzy-1')
  await page.getByTestId('music-play').click()
  await fetched
  await expect(button(page)).toHaveAttribute('data-state', 'playing')
  await expect(page.getByTestId('music-now')).toContainText('Late Set')
  await expect(page.getByTestId('music-now')).toContainText('CC0')

  await page.getByTestId('music-pause').click()
  await expect(button(page)).toHaveAttribute('data-state', 'paused')
  await page.getByTestId('music-stop').click()
  await expect(button(page)).toHaveAttribute('data-state', 'stopped')
})

test('offers only the genres the library has', async ({ page }) => {
  await withLibrary(page)
  await button(page).click()
  await expect(sheet(page).getByRole('radio')).toHaveText(['Jazz lounge', 'Ambient'])
})

test('keeps this device’s mute through a reload', async ({ page }) => {
  await withLibrary(page)
  await button(page).click()
  await page.getByTestId('music-mute').click()
  await expect(page.getByTestId('music-mute')).toHaveAttribute('aria-pressed', 'true')

  await page.reload()
  await page.waitForSelector('[data-testid="status-bar"]')
  await button(page).click()
  await expect(page.getByTestId('music-mute')).toHaveAttribute('aria-pressed', 'true')
})

test('opens and closes from the keyboard, and hands focus back', async ({ page }) => {
  await withLibrary(page)
  await button(page).focus()
  await page.keyboard.press('Enter')
  await expect(sheet(page).getByRole('radio').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)
  await expect(button(page)).toBeFocused()
})
