import { expect, test } from '@playwright/test'

import { BOARD_URL } from '../e2e/routes.js'
import { inBucket, newRoomId } from './rooms.js'

/**
 * An upload checked by the room itself, not only by the browser.
 *
 * The policy is unit-tested in `packages/core/src/uploads` and the room's
 * reading of the body in `apps/rooms/src/assets.test.ts`. This is a client
 * that never ran the browser's check — a plain fetch with an image's type and
 * somebody else's bytes — and the bucket it must not reach.
 */
test('the room refuses markup sent as an image, and stores nothing', async ({ page }) => {
  const room = newRoomId()
  await page.goto(BOARD_URL)

  const statuses = await page.evaluate(async (id) => {
    const base = `http://127.0.0.1:8787/room/${id}`
    const claimed = await fetch(`${base}/claim`, { method: 'POST' })
    const keys = (await claimed.json()) as { editor: string }
    const put = (name: string, body: Uint8Array<ArrayBuffer>) =>
      fetch(`${base}/asset/${name}`, {
        method: 'PUT',
        headers: { 'content-type': 'image/png', 'x-openframe-key': keys.editor },
        body,
      }).then((response) => response.status)

    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    )
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    return { disguised: await put('img_svg', svg), genuine: await put('img_png', png) }
  }, room)

  expect(statuses.disguised).toBe(415)
  expect(await inBucket(`${room}/img_svg`)).toBe(false)
  // And a real one still goes through, or the check above proves nothing.
  expect(statuses.genuine).toBe(204)
  expect(await inBucket(`${room}/img_png`)).toBe(true)
})
