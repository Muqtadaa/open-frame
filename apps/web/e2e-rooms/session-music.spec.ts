import { expect, test, type Browser, type Page } from '@playwright/test'

import { library, TRACKS } from '../e2e/music.js'
import { BOARD_URL } from '../e2e/routes.js'
import { join, newRoomId } from './rooms.js'

/**
 * Session music through a real room (ADR 0017): the same track, at the same
 * place, on two devices — one of whose clocks is wrong.
 *
 * The library is stood in for on each page, because the shipped catalogue is
 * empty until tracks are approved. What crosses the room is the music record
 * and the clock, which is what this is about; the worker's own routes are
 * checked at the end.
 */

const ROOMS = 'http://127.0.0.1:8787'
const SKEW_MS = 90_000

/** Seconds into the track, from the sheet's `m:ss / m:ss`. */
async function secondsIn(page: Page): Promise<number> {
  const text = (await page.getByTestId('music-elapsed').textContent()) ?? ''
  const match = /^(\d+):(\d\d)/.exec(text)
  expect(match, `the sheet reads a time, not “${text}”`).not.toBeNull()
  return Number(match?.[1]) * 60 + Number(match?.[2])
}

async function joinSkewed(browser: Browser, room: string): Promise<Page> {
  const context = await browser.newContext()
  await context.addInitScript((skew) => {
    const real = Date.now.bind(Date)
    Date.now = () => real() + skew
  }, SKEW_MS)
  const page = await context.newPage()
  await library(page, TRACKS, ROOMS)
  await page.goto(`/?room=${room}`)
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-room', 'connected', {
    timeout: 20_000,
  })
  return page
}

test('two devices whose clocks disagree are at the same place in the same track', async ({
  browser,
}) => {
  const room = newRoomId()
  const alice = await join(browser, room)
  await library(alice, TRACKS, ROOMS)
  await alice.reload()
  await expect(alice.getByTestId('save-state')).toHaveAttribute('data-room', 'connected', {
    timeout: 20_000,
  })
  const bob = await joinSkewed(browser, room)

  await alice.getByTestId('session-button').click()
  await alice.getByRole('radio', { name: 'Jazz lounge' }).click()
  await alice.getByTestId('music-play').click()

  // Bob did not press anything that opens audio, so the bar says so.
  await expect(bob.getByTestId('session-button')).toHaveAttribute('data-music', 'unheard')
  await bob.getByTestId('session-button').click()
  await expect(bob.getByTestId('music-now')).toContainText('Late Set')
  // And so does the sheet.
  await expect(bob.getByTestId('music-listen')).toBeVisible()

  const [mine, theirs] = await Promise.all([secondsIn(alice), secondsIn(bob)])
  expect(Math.abs(mine - theirs)).toBeLessThanOrEqual(1)
  expect(theirs).toBeLessThan(60)
})

/*
 * A device that loaded the catalogue before a track was approved, and one
 * that loaded it after, still play the same track at the same place: the run
 * carries its own playlist (Codex, on #64).
 */
test('two devices with different catalogues still play the same track', async ({ browser }) => {
  const room = newRoomId()
  const alice = await join(browser, room)
  await library(alice, TRACKS, ROOMS)
  await alice.reload()
  await expect(alice.getByTestId('save-state')).toHaveAttribute('data-room', 'connected', {
    timeout: 20_000,
  })
  const bob = await (await browser.newContext()).newPage()
  await library(
    bob,
    [{ id: 'jazzy-0', genre: 'jazzhop', title: 'Approved Since' }, ...TRACKS],
    ROOMS,
  )
  await bob.goto(`/?room=${room}`)
  await expect(bob.getByTestId('save-state')).toHaveAttribute('data-room', 'connected', {
    timeout: 20_000,
  })

  await alice.getByTestId('session-button').click()
  await alice.getByRole('radio', { name: 'Jazz lounge' }).click()
  await alice.getByTestId('music-play').click()

  await expect(bob.getByTestId('session-button')).toHaveAttribute('data-music', 'unheard')
  await bob.getByTestId('session-button').click()
  await expect(bob.getByTestId('music-now')).toContainText('Late Set')
})

/*
 * What a team found: the music started somewhere else and nobody here knew,
 * because the one press that lets it in was inside a sheet nobody opened.
 */
test('somebody else starting the music is offered here, and one press lets it in', async ({
  browser,
}) => {
  const room = newRoomId()
  const tracks = [
    { id: 'jazzy-1', genre: 'jazzhop', title: 'Late Set' },
    { id: 'jazzy-2', genre: 'jazzhop', title: 'Encore' },
  ] as const
  const open = async (): Promise<Page> => {
    const page = await (await browser.newContext()).newPage()
    await library(page, tracks, ROOMS)
    await page.goto(`/?room=${room}`)
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-room', 'connected', {
      timeout: 20_000,
    })
    return page
  }
  const alice = await open()
  const bob = await open()

  await alice.getByTestId('session-button').click()
  await alice.getByTestId('music-play').click()

  await expect(bob.getByTestId('music-prompt')).toHaveText(/ started the music$/)
  const fetched = bob.waitForRequest('**/music/track/jazzy-1')
  await bob.getByTestId('music-prompt-listen').click()
  await fetched
  await expect(bob.getByTestId('session-button')).toHaveAttribute('data-music', 'playing')
  await expect(bob.getByTestId('music-prompt')).toHaveCount(0)

  // Alice skips; Bob follows, and is not asked again — it is the same music.
  const next = bob.waitForRequest('**/music/track/jazzy-2')
  await alice.getByRole('button', { name: 'Next track' }).click()
  await next
  await bob.getByTestId('session-button').click()
  await expect(bob.getByTestId('music-now')).toContainText('Encore')
  await expect(bob.getByTestId('music-prompt')).toHaveCount(0)
})

test('a viewer hears the music and cannot change it', async ({ browser }) => {
  const room = newRoomId()
  const opener = await (await browser.newContext()).newPage()
  await opener.goto(BOARD_URL)
  const keys = await opener.evaluate(async (id) => {
    const response = await fetch(`http://127.0.0.1:8787/room/${id}/claim`, { method: 'POST' })
    if (!response.ok) throw new Error(`claim failed: ${String(response.status)}`)
    return (await response.json()) as { editor: string; viewer: string }
  }, room)
  const open = async (key: string): Promise<Page> => {
    const page = await (await browser.newContext()).newPage()
    await library(page, TRACKS, ROOMS)
    await page.goto(`/?room=${room}&k=${key}`)
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-room', 'connected', {
      timeout: 20_000,
    })
    return page
  }
  const editor = await open(keys.editor)
  const viewer = await open(keys.viewer)
  await expect(viewer.getByTestId('session-button')).toHaveCount(0)

  await editor.getByTestId('session-button').click()
  await editor.getByTestId('music-play').click()
  await expect(viewer.getByTestId('session-button')).toHaveAttribute('data-music', 'unheard')
  // A viewer is asked to listen like anybody else, and has no skip.
  await expect(viewer.getByTestId('music-prompt')).toBeVisible()

  await viewer.getByTestId('session-button').click()
  await expect(viewer.getByRole('button', { name: 'Next track' })).toHaveCount(0)
  await expect(viewer.getByTestId('music-listen')).toBeVisible()
  await expect(viewer.getByTestId('music-play')).toHaveCount(0)
  await expect(viewer.getByTestId('music-pause')).toHaveCount(0)
  await expect(viewer.getByRole('radio', { name: 'Ambient' })).toBeDisabled()
})

test('the room server serves its library publicly, and only what it lists', async ({ request }) => {
  const catalogue = await request.get(`${ROOMS}/music/catalogue`)
  expect(catalogue.status()).toBe(200)
  expect(catalogue.headers()['access-control-allow-origin']).toBe('*')
  expect(await catalogue.json()).toMatchObject({ v: 1 })

  const unlisted = await request.get(`${ROOMS}/music/track/not-approved`)
  expect(unlisted.status()).toBe(404)
  const write = await request.put(`${ROOMS}/music/track/calm-1`, { data: 'x' })
  expect(write.status()).toBe(405)
})
