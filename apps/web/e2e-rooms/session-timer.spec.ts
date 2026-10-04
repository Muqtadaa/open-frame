import { expect, test, type Browser, type Page } from '@playwright/test'

import { BOARD_URL } from '../e2e/routes.js'
import { join, newRoomId } from './rooms.js'

/**
 * The session timer through a real room (ADR 0017): one countdown, read the
 * same on every device — including one whose own clock is wrong.
 */

const SKEW_MS = 90_000

/** Seconds left on a pill reading `m:ss`. */
async function secondsLeft(page: Page): Promise<number> {
  const text = (await page.getByTestId('timer-button').textContent()) ?? ''
  const match = /(\d+):(\d\d)/.exec(text)
  expect(match, `the pill reads a time, not “${text}”`).not.toBeNull()
  return Number(match?.[1]) * 60 + Number(match?.[2])
}

/** Joins from a device whose clock runs a minute and a half fast. */
async function joinSkewed(browser: Browser, room: string): Promise<Page> {
  const context = await browser.newContext()
  await context.addInitScript((skew) => {
    const real = Date.now.bind(Date)
    Date.now = () => real() + skew
  }, SKEW_MS)
  const page = await context.newPage()
  await page.goto(`/?room=${room}`)
  await expect(page.getByTestId('room-status')).toHaveAttribute('data-status', 'connected', {
    timeout: 20_000,
  })
  return page
}

test('two devices whose clocks disagree show the same time left', async ({ browser }) => {
  const room = newRoomId()
  const alice = await join(browser, room)
  const bob = await joinSkewed(browser, room)
  // Bob's clock really is wrong, or this proves nothing.
  const apart = (await bob.evaluate(() => Date.now())) - (await alice.evaluate(() => Date.now()))
  expect(apart).toBeGreaterThan(SKEW_MS - 5000)

  await alice.getByTestId('timer-button').click()
  await alice.getByRole('button', { name: '5 minutes', exact: true }).click()
  await alice.getByTestId('timer-start').click()
  await expect(bob.getByTestId('timer-button')).toHaveAttribute('data-state', 'running')

  const [mine, theirs] = await Promise.all([secondsLeft(alice), secondsLeft(bob)])
  expect(Math.abs(mine - theirs)).toBeLessThanOrEqual(1)
  expect(theirs).toBeGreaterThan(280)
})

test('a viewer sees the timer and cannot run it', async ({ browser }) => {
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
    await page.goto(`/?room=${room}&k=${key}`)
    await expect(page.getByTestId('room-status')).toHaveAttribute('data-status', 'connected', {
      timeout: 20_000,
    })
    return page
  }
  const editor = await open(keys.editor)
  const viewer = await open(keys.viewer)

  // Nothing to watch yet, so nothing on the viewer's bar.
  await expect(viewer.getByTestId('timer-button')).toHaveCount(0)

  await editor.getByTestId('timer-button').click()
  await editor.getByTestId('timer-start').click()
  await expect(viewer.getByTestId('timer-button')).toHaveAttribute('data-state', 'running')

  await viewer.getByTestId('timer-button').click()
  await expect(viewer.getByTestId('timer-readout')).toBeVisible()
  await expect(viewer.getByTestId('timer-pause')).toHaveCount(0)
  await expect(viewer.getByTestId('timer-reset')).toHaveCount(0)
})
