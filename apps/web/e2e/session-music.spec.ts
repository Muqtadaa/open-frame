import type { Page } from '@playwright/test'

import { goto, reload, test, expect } from './fixtures.js'
import { library, TRACKS } from './music.js'
import { BOARD_URL } from './routes.js'

/**
 * Session music (ADR 0017): one playlist, at the same place on every device.
 * The rooms suite plays it between two browsers; here, one person on a board
 * that is nobody else's, with a stand-in library.
 */

test.use({ board: 'fresh' })

const button = (page: Page) => page.getByTestId('session-button')
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Session' })

async function withLibrary(page: Page, tracks = TRACKS): Promise<void> {
  await library(page, tracks)
  await reload(page)
  await page.waitForSelector('[data-testid="status-bar"]')
}

test('offers no music where there is no library to play from', async ({ page }) => {
  await library(page, null)
  await reload(page)
  await page.waitForSelector('[data-testid="status-bar"]')
  // The session is still there for its timer; it has no music to offer.
  await button(page).click()
  await expect(sheet(page).getByRole('region', { name: 'Timer' })).toBeVisible()
  await expect(sheet(page).getByRole('region', { name: 'Music' })).toHaveCount(0)
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
  await expect(button(page)).toHaveAttribute('data-music', 'playing')
  await expect(page.getByTestId('music-now')).toContainText('Late Set')
  await expect(page.getByTestId('music-now')).toContainText('CC0')

  await page.getByTestId('music-pause').click()
  await expect(button(page)).toHaveAttribute('data-music', 'paused')
  await page.getByTestId('music-stop').click()
  await expect(button(page)).toHaveAttribute('data-music', 'stopped')
})

test('offers only the genres the library has', async ({ page }) => {
  await withLibrary(page)
  await button(page).click()
  await expect(sheet(page).getByRole('radio')).toHaveText(['Jazz lounge', 'Ambient'])
})

test('is one stop for the genres, walked with the arrows', async ({ page }) => {
  await withLibrary(page)
  await button(page).click()
  const jazz = sheet(page).getByRole('radio', { name: 'Jazz lounge' })
  const ambient = sheet(page).getByRole('radio', { name: 'Ambient' })
  await jazz.focus()
  await page.keyboard.press('ArrowRight')
  await expect(ambient).toBeFocused()
  await expect(ambient).toHaveAttribute('aria-checked', 'true')
  // One Tab stop for the group, as a radio group is: Tab leaves it.
  await expect(jazz).toHaveAttribute('tabindex', '-1')
})

test('gives the volume a target a pointer can find', async ({ page }) => {
  await withLibrary(page)
  await button(page).click()
  const box = await page.getByTestId('music-volume').boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(24)
})

test('keeps this device’s mute through a reload', async ({ page }) => {
  await withLibrary(page)
  await button(page).click()
  await page.getByTestId('music-mute').click()
  await expect(page.getByTestId('music-mute')).toHaveAttribute('aria-pressed', 'true')

  await reload(page)
  await page.waitForSelector('[data-testid="status-bar"]')
  await button(page).click()
  await expect(page.getByTestId('music-mute')).toHaveAttribute('aria-pressed', 'true')
})

test('opens and closes from the keyboard, and hands focus back', async ({ page }) => {
  await withLibrary(page)
  await button(page).focus()
  await page.keyboard.press('Enter')
  // Into the sheet, at the timer that heads it.
  await expect(page.getByTestId('timer-start')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)
  await expect(button(page)).toBeFocused()
})

/*
 * Somebody else started the music. On a local board that is a record already
 * in this browser's storage when the board opens — exactly what a peer's Play
 * looks like to a device that has not pressed anything yet.
 */
async function startedByAda(page: Page): Promise<void> {
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
  await page.waitForSelector('[data-testid="status-bar"]')
}

const prompt = (page: Page) => page.getByTestId('music-prompt')

test('says who started the music, and lets this device in with one press', async ({ page }) => {
  await startedByAda(page)
  await expect(prompt(page)).toHaveText('Ada started the music')
  await expect(button(page)).toHaveAttribute('data-music', 'unheard')
  // It asks; it does not take the keyboard from whatever had it.
  await expect(page.getByTestId('music-prompt-listen')).not.toBeFocused()

  const fetched = page.waitForRequest('**/music/track/jazzy-1')
  await page.getByTestId('music-prompt-listen').click()
  await fetched
  await expect(prompt(page)).toHaveCount(0)
  await expect(button(page)).toHaveAttribute('data-music', 'playing')
})

test('waved away, the prompt goes and the button still says so', async ({ page }) => {
  await startedByAda(page)
  await page.getByTestId('music-prompt-dismiss').click()
  await expect(prompt(page)).toHaveCount(0)
  await expect(button(page)).toHaveAttribute('data-music', 'unheard')
  await expect(button(page)).toHaveAccessibleName(
    'Session, music, Jazz lounge, playing, not playing here',
  )
})

test('from the keyboard, Escape waves the prompt away and the keyboard goes to the pill', async ({
  page,
}) => {
  await startedByAda(page)
  await page.getByTestId('music-prompt-dismiss').focus()
  await page.keyboard.press('Escape')
  await expect(prompt(page)).toHaveCount(0)
  await expect(button(page)).toBeFocused()
})

test('once this browser has said yes, the next press anywhere lets the music in', async ({
  page,
  context,
}) => {
  await startedByAda(page)
  await page.getByTestId('music-prompt-listen').click()
  await expect(button(page)).toHaveAttribute('data-music', 'playing')
  // Chromium: the remembered yes needs no further press at all.
  const opened = await context.newPage()
  await library(opened, TRACKS)
  await goto(opened, BOARD_URL)
  await expect(button(opened)).toHaveAttribute('data-music', 'playing')
  await expect(prompt(opened)).toHaveCount(0)

  /*
   * A page nobody has pressed yet waits for a press, anywhere. Chromium counts
   * opening a page as one, so there it joins at once; Safari does not, and
   * this tab is made to answer as Safari would.
   */
  const tab = await context.newPage()
  await tab.addInitScript(() => {
    Object.defineProperty(navigator, 'userActivation', {
      value: { hasBeenActive: false, isActive: false },
    })
  })
  await library(tab, TRACKS)
  await goto(tab, BOARD_URL)
  await tab.waitForSelector('[data-testid="status-bar"]')
  await expect(button(tab)).toHaveAttribute('data-music', 'unheard')
  const fetched = tab.waitForRequest('**/music/track/jazzy-1')
  await tab.getByTestId('canvas').click({ position: { x: 400, y: 300 } })
  await fetched
  await expect(button(tab)).toHaveAttribute('data-music', 'playing')
  await expect(prompt(tab)).toHaveCount(0)
})

test('a browser that has not said yes waits for the prompt, whatever else is pressed', async ({
  page,
}) => {
  await startedByAda(page)
  await expect(prompt(page)).toBeVisible()
  await page.getByTestId('canvas').click({ position: { x: 400, y: 300 } })
  await expect(button(page)).toHaveAttribute('data-music', 'unheard')
  await expect(prompt(page)).toBeVisible()
})

test('moves to the next track and back, within the genre', async ({ page }) => {
  await withLibrary(page, [
    { id: 'jazzy-1', genre: 'jazzhop', title: 'Late Set' },
    { id: 'jazzy-2', genre: 'jazzhop', title: 'Encore' },
  ])
  await button(page).click()
  await page.getByTestId('music-play').click()
  await expect(page.getByTestId('music-now')).toContainText('Late Set')

  const next = page.waitForRequest('**/music/track/jazzy-2')
  await page.getByRole('button', { name: 'Next track' }).click()
  await next
  await expect(page.getByTestId('music-now')).toContainText('Encore')
  await expect(page.getByTestId('music-elapsed')).toHaveText(/^0:0\d \/ 2:00$/)
  await expect(button(page)).toHaveAttribute('data-music', 'playing')

  await page.getByRole('button', { name: 'Previous track' }).click()
  await expect(page.getByTestId('music-now')).toContainText('Late Set')

  // Paused, it moves too, and stays paused at the top of the track.
  await page.getByTestId('music-pause').click()
  await page.getByRole('button', { name: 'Next track' }).click()
  await expect(page.getByTestId('music-now')).toContainText('Encore')
  await expect(page.getByTestId('music-elapsed')).toHaveText('0:00 / 2:00')
  await expect(button(page)).toHaveAttribute('data-music', 'paused')
})

/*
 * Managing somebody else's music is not asking to hear it: only Listen, Play
 * and Resume are, so only they are remembered (Codex, on #87).
 */
test('stopping music this device was not hearing says no yes', async ({ page }) => {
  await startedByAda(page)
  await button(page).click()
  await page.getByRole('button', { name: 'Next track' }).click()
  await page.getByTestId('music-pause').click()
  await page.getByTestId('music-stop').click()
  expect(await page.evaluate(() => window.localStorage.getItem('openframe:music-join'))).toBeNull()
})

/*
 * A browser that refuses the sound after all — an autoplay policy — is asked
 * once and then left to the prompt: no retrying, over and over, behind it
 * (Codex, on #87).
 */
test('a refused automatic join waits for a press instead of retrying', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('openframe:music-join', 'true')
    const plays = { count: 0 }
    Object.assign(window, { plays })
    HTMLMediaElement.prototype.play = function play() {
      plays.count += 1
      return Promise.reject(new DOMException('refused', 'NotAllowedError'))
    }
  })
  await startedByAda(page)
  await expect(prompt(page)).toHaveText('Ada started the music')
  // Long enough for a loop to show itself: several follow ticks.
  await expect(button(page)).toHaveAttribute('data-music', 'unheard')
  await page.waitForFunction(() => document.readyState === 'complete')
  const settle = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        setTimeout(() => {
          resolve((window as unknown as { plays: { count: number } }).plays.count)
        }, 3000)
      }),
  )
  expect(settle).toBeLessThanOrEqual(1)
  await expect(prompt(page)).toBeVisible()
})
