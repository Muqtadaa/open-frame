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
  await expect(page.getByTestId('room-status')).toHaveAttribute('data-status', 'connected', {
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
  await expect(alice.getByTestId('room-status')).toHaveAttribute('data-status', 'connected', {
    timeout: 20_000,
  })
  const bob = await joinSkewed(browser, room)

  await alice.getByTestId('music-button').click()
  await alice.getByRole('radio', { name: 'Jazzy' }).click()
  await alice.getByTestId('music-play').click()

  await expect(bob.getByTestId('music-button')).toHaveAttribute('data-state', 'playing')
  await bob.getByTestId('music-button').click()
  await expect(bob.getByTestId('music-now')).toContainText('Late Set')
  // Bob did not press anything that opens audio, so the sheet offers it.
  await expect(bob.getByTestId('music-listen')).toBeVisible()

  const [mine, theirs] = await Promise.all([secondsIn(alice), secondsIn(bob)])
  expect(Math.abs(mine - theirs)).toBeLessThanOrEqual(1)
  expect(theirs).toBeLessThan(60)
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
    await expect(page.getByTestId('room-status')).toHaveAttribute('data-status', 'connected', {
      timeout: 20_000,
    })
    return page
  }
  const editor = await open(keys.editor)
  const viewer = await open(keys.viewer)
  await expect(viewer.getByTestId('music-button')).toHaveCount(0)

  await editor.getByTestId('music-button').click()
  await editor.getByTestId('music-play').click()
  await expect(viewer.getByTestId('music-button')).toHaveAttribute('data-state', 'playing')

  await viewer.getByTestId('music-button').click()
  await expect(viewer.getByTestId('music-listen')).toBeVisible()
  await expect(viewer.getByTestId('music-play')).toHaveCount(0)
  await expect(viewer.getByTestId('music-pause')).toHaveCount(0)
  await expect(viewer.getByRole('radio', { name: 'Calm' })).toBeDisabled()
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
