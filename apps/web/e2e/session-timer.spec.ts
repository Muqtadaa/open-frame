import type { Page } from '@playwright/test'

import { expect, test } from './fixtures.js'

test.use({ board: 'fresh' })

/**
 * The session timer: one countdown a facilitator runs for everybody at the
 * board (ADR 0017). On a board that is nobody else's it runs on this device's
 * clock and is kept in this browser, so the clock here is Playwright's.
 */

const pill = (page: Page) => page.getByTestId('session-button')
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Session' })
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
  await expect(pill(page)).toHaveAttribute('data-timer', 'running')

  await page.clock.runFor(2000)
  await expect(pill(page)).toContainText('0:03')

  await page.clock.runFor(4000)
  await expect(pill(page)).toHaveAttribute('data-timer', 'done')
  await expect(readout(page)).toHaveText('Time’s up')
  await expect(page.getByTestId('board-announcer')).toContainText('Time’s up')
  // Its name holds what it shows — "0:00" — and not only what that means.
  await expect(pill(page)).toHaveAccessibleName('Session, timer, 0:00, time’s up')
  await expect(page.getByTestId('timer-add-minute')).toHaveAccessibleName('+1 min')
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
  await expect(pill(page)).toHaveAttribute('data-timer', 'idle')
})

test('is still running after a reload', async ({ page }) => {
  await startFor(page, '5')
  await page.reload()
  await expect(pill(page)).toHaveAttribute('data-timer', 'running')
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

test('keeps the keyboard on the control it pressed, through start, pause, resume and reset', async ({
  page,
}) => {
  await pill(page).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('timer-start')).toBeFocused()
  // The pressed control turns into the next one, so focus never falls to the page.
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('timer-pause')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('timer-resume')).toBeFocused()
  await page.getByTestId('timer-reset').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('timer-start')).toBeFocused()
})

test('keeps Tab inside the open sheet', async ({ page }) => {
  await pill(page).click()
  for (let press = 0; press < 12; press++) await page.keyboard.press('Tab')
  await expect(sheet(page).locator(':focus')).toHaveCount(1)
})

/*
 * One pill for the session. The timer and the music were two icons on the
 * bar with a sheet each; the pill names the session at rest and says what is
 * running while it runs, and opens on a key.
 */
test.describe('the session pill', () => {
  test('names the session at rest, and reads the time while it runs', async ({ page }) => {
    await expect(pill(page)).toHaveText('Session')
    await expect(pill(page)).toHaveAccessibleName('Session')
    await startFor(page, '5')
    await expect(pill(page)).toHaveText(/^\d:\d\d$/)
    await expect(pill(page)).toHaveAccessibleName(/^Session, timer, \d:\d\d left$/)
  })

  test('holds the timer and the music in one sheet', async ({ page }) => {
    await pill(page).click()
    await expect(sheet(page).getByRole('heading', { name: 'Timer' })).toBeVisible()
    // The bar has one session control, not a clock and a note.
    await expect(page.getByTestId('timer-button')).toHaveCount(0)
    await expect(page.getByTestId('music-button')).toHaveCount(0)
  })

  test('opens on Alt+T, at the timer, and hands the keyboard back', async ({ page }) => {
    await page.getByTestId('canvas').focus()
    await page.keyboard.press('Alt+t')
    await expect(sheet(page)).toBeVisible()
    await expect(page.getByTestId('timer-start')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toHaveCount(0)
    await expect(pill(page)).toBeFocused()
  })
})

/*
 * Paused reads as paused, and Reset can be taken back (PR 3 critique,
 * 2026-10-07). A paused pill looked exactly like a running one — the same
 * clock, the same ink — and Reset threw the run away with no way back.
 */
test('a paused pill looks and says paused', async ({ page }) => {
  await page.clock.install()
  await startFor(page, '5:00')
  await page.getByTestId('timer-pause').click()
  await expect(pill(page).getByTestId('session-paused')).toBeVisible()
  await expect(pill(page)).toHaveAccessibleName('Session, timer, 5:00 left, paused')
  await page.getByTestId('timer-resume').click()
  await expect(pill(page).getByTestId('session-paused')).toHaveCount(0)
})

test('Reset can be undone where it was pressed', async ({ page }) => {
  await page.clock.install()
  await startFor(page, '5:00')
  await page.getByTestId('timer-pause').click()
  await page.getByTestId('timer-reset').click()
  await expect(pill(page)).toHaveAttribute('data-timer', 'idle')
  await expect(page.getByTestId('board-announcer')).toContainText('Timer reset')
  await page.getByTestId('timer-undo-reset').click()
  await expect(pill(page)).toHaveAttribute('data-timer', 'paused')
  await expect(pill(page)).toContainText('5:00')
})
