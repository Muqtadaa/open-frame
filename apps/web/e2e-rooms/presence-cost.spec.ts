import { expect, test, type Browser, type Page } from '@playwright/test'

import { join, newRoomId } from './rooms.js'

/**
 * What a cursor costs (CLAUDE.md rule 29).
 *
 * Every message a board sends is a request against the room server's daily
 * allowance and wakes the room. The cursor went out up to twenty times a
 * second — with nobody else in the room to see it, too.
 */

/** The first byte of a frame says what it is; awareness is 1 (collab/protocol.ts). */
const AWARENESS = 1

interface Counted {
  readonly page: Page
  readonly sent: () => number
}

/** Joins like `join`, counting the awareness frames this page sends. */
async function joinCounting(browser: Browser, room: string): Promise<Counted> {
  const context = await browser.newContext()
  const page = await context.newPage()
  let sent = 0
  page.on('websocket', (socket) => {
    socket.on('framesent', (frame) => {
      const payload = frame.payload
      const first = typeof payload === 'string' ? payload.charCodeAt(0) : payload[0]
      if (first === AWARENESS) sent += 1
    })
  })
  await page.goto(`/?room=${room}`)
  await expect(page.locator('[data-testid="save-state"]')).toHaveAttribute(
    'data-room',
    'connected',
    { timeout: 20_000 },
  )
  return { page, sent: () => sent }
}

/** A second of a pointer wandering over the board; how long it really took. */
async function wander(page: Page): Promise<number> {
  const started = Date.now()
  await page.mouse.move(300, 300)
  await page.mouse.move(900, 500, { steps: 60 })
  await page.mouse.move(400, 600, { steps: 60 })
  return Date.now() - started
}

test('a cursor nobody else can see is not sent', async ({ browser }) => {
  const room = newRoomId()
  const alone = await joinCounting(browser, room)
  const before = alone.sent()
  await wander(alone.page)
  expect(alone.sent() - before).toBe(0)
  await alone.page.context().close()
})

test('with somebody there, the cursor goes out at most ten times a second', async ({ browser }) => {
  const room = newRoomId()
  const mover = await joinCounting(browser, room)
  const watcher = await join(browser, room)
  // The watcher is seen — its cursor drawn here — before anything is counted.
  await watcher.mouse.move(500, 400)
  await watcher.mouse.move(520, 420)
  await expect(mover.page.getByTestId('presence-cursor')).toHaveCount(1)
  const before = mover.sent()
  const took = await wander(mover.page)
  const sent = mover.sent() - before
  expect(sent).toBeGreaterThan(2)
  expect(sent).toBeLessThanOrEqual(Math.ceil(took / 100) + 2)
  // And the watcher sees where it went.
  await expect(watcher.locator('[data-testid="presence-cursor"]')).toHaveCount(1)
  await mover.page.context().close()
  await watcher.context().close()
})
