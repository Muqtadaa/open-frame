import { expect, test } from '@playwright/test'

/**
 * The suite must never open a socket to a room server that really exists.
 *
 * `apps/web/.env` is committed and points `VITE_COLLAB_URL` at the deployed
 * worker — correct for `pnpm dev`, and the reason several specs spent months
 * joining a REAL Durable Object. `?room=brd_abcdefgh12345678` is not a
 * fixture: every CI run drew a sticky note into that room and left it there,
 * so a test asserting one object on the canvas eventually read five, then six.
 * It was measuring the accumulated contents of a production room.
 *
 * The playwright config now points the dev server at a closed local port. This
 * asserts the consequence rather than the setting, because the setting can be
 * removed by anyone and the failure it causes is invisible on a machine that
 * cannot reach the worker anyway.
 */
test('never opens a socket to anywhere but this machine', async ({ page }) => {
  const opened: string[] = []
  page.on('websocket', (socket) => opened.push(socket.url()))

  // A room URL, so the app genuinely tries to connect. Anything it reaches for
  // is a socket this assertion gets to see.
  await page.goto(`/?room=brd_abcdefgh12345678&k=${'e'.repeat(32)}`)
  await page.waitForSelector('[data-testid="status-bar"]')

  // It attempts the room, and is refused by a port with nothing behind it.
  await expect.poll(() => opened.some((url) => url.includes('/room/'))).toBe(true)

  for (const url of opened) {
    expect(new URL(url).hostname, `the suite opened a socket to ${url}`).toMatch(
      /^(127\.0\.0\.1|\[::1\]|localhost)$/,
    )
  }
})
