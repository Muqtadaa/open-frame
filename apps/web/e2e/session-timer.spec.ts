import type { Page } from '@playwright/test'

import { expect, test } from './fixtures.js'

test.use({ board: 'fresh' })

/**
 * The session timer: one countdown a facilitator runs for everybody at the
 * board (ADR 0017). On a board that is nobody else's it runs on this device's
 * clock and is kept in this browser, so the clock here is Playwright's.
 */

const pill = (page: Page) => page.getByTestId('timer-button')
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Timer' })
const readout = (page: Page) => page.getByTestId('timer-readout')

async function startFor(page: Page, typed: string): Promise<void> {
  await pill(page).click()
  await page.getByTestId('timer-duration').fill(typed)
  await page.getByTestId('timer-duration').press('Enter')
  await page.getByTestId('timer-start').click()
}

test('runs down, and says when time is up', async ({ page }) => {
  await page.clock.install()
  await startFor(page, '0:05')
  await expect(pill(page)).toHaveAttribute('data-state', 'running')

  await page.clock.runFor(2000)
  await expect(pill(page)).toContainText('0:03')

  await page.clock.runFor(4000)
  await expect(pill(page)).toHaveAttribute('data-state', 'done')
  await expect(readout(page)).toHaveText('Time’s up')
  await expect(page.getByTestId('board-announcer')).toContainText('Time’s up')
})

test('says when one minute is left', async ({ page }) => {
  await page.clock.install()
  await startFor(page, '1:05')
  await page.clock.runFor(6000)
  await expect(page.getByTestId('board-announcer')).toContainText('1 minute left')
})

/*
 * Adding a minute to a run that has already warned does not make it a new
 * run, so it does not warn again on the way back down (Codex, on #63).
 */
test('says one minute is left once per run, even after a minute is added', async ({ page }) => {
  await page.clock.install()
  await page.getByTestId('board-announcer').evaluate((region) => {
    const said: string[] = []
    new MutationObserver(() => {
      if (region.textContent !== '') said.push(region.textContent ?? '')
    }).observe(region, { childList: true, characterData: true, subtree: true })
    Object.assign(window, { said })
  })
  await startFor(page, '1:05')
  await page.clock.runFor(6000)
  await expect(page.getByTestId('board-announcer')).toContainText('1 minute left')

  await page.getByTestId('timer-add-minute').click()
  await page.clock.runFor(61_000)
  await expect(pill(page)).toContainText(/^0:5\d/)
  const said = await page.evaluate(() => (window as unknown as { said: string[] }).said)
  expect(said.filter((text) => text === '1 minute left')).toHaveLength(1)
})

test('pauses where it is, resumes from there, takes a minute more, and resets', async ({
  page,
}) => {
  await page.clock.install()
  await pill(page).click()
  await sheet(page).getByRole('button', { name: '3 minutes' }).click()
  await expect(sheet(page).getByRole('button', { name: '3 minutes' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByTestId('timer-start').click()
  await page.clock.runFor(10_000)
  await page.getByTestId('timer-pause').click()
  await expect(readout(page)).toHaveText('2:50')

  await page.clock.runFor(60_000)
  await expect(readout(page)).toHaveText('2:50')

  await page.getByTestId('timer-resume').click()
  await page.getByTestId('timer-add-minute').click()
  await expect(readout(page)).toHaveText('3:50')

  await page.getByTestId('timer-reset').click()
  await expect(readout(page)).toHaveText('3:00')
  await expect(pill(page)).toHaveAttribute('data-state', 'idle')
})

test('is still running after a reload', async ({ page }) => {
  await startFor(page, '5')
  await page.reload()
  await expect(pill(page)).toHaveAttribute('data-state', 'running')
  await expect(pill(page)).toContainText(/^4:5\d|^5:00/)
})

test('opens and closes from the keyboard, and hands focus back', async ({ page }) => {
  await pill(page).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('timer-start')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)
  await expect(pill(page)).toBeFocused()
})
