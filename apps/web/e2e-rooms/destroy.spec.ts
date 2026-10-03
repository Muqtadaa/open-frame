import { expect, test } from '@playwright/test'

import { BOARD_URL } from '../e2e/routes.js'
import { inBucket, newRoomId } from './rooms.js'

/**
 * Destroying a room, asked of a real one.
 *
 * The decision is unit-tested in `apps/rooms/src/access.test.ts`; this is the
 * Durable Object honouring it. The edit link is a bearer credential handed to
 * everybody invited to change the board — so a request made straight to the
 * room with it, bypassing any interface that would never offer the button,
 * must leave the board exactly where it was.
 */
test('only the owner key destroys a room', async ({ page }) => {
  const room = newRoomId()
  await page.goto(BOARD_URL)

  const answers = await page.evaluate(async (id) => {
    const base = `http://127.0.0.1:8787/room/${id}`
    const post = async (path: string, body: unknown): Promise<[number, unknown]> => {
      const response = await fetch(`${base}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      return [response.status, await response.json().catch(() => null)]
    }
    const claimed = await fetch(`${base}/claim`, { method: 'POST' })
    const keys = (await claimed.json()) as { editor: string; viewer: string; owner: string }

    const byEditor = await post('destroy', { key: keys.editor })
    const byViewer = await post('destroy', { key: keys.viewer })
    const byStranger = await post('destroy', { key: 'x'.repeat(32) })
    const byNobody = await post('destroy', {})
    // Still there: the edit link opens it exactly as before.
    const survived = await post('protection', { key: keys.editor })

    const byOwner = await post('destroy', { key: keys.owner })
    const afterwards = await post('protection', { key: keys.editor })
    const again = await post('destroy', { key: keys.owner })
    return { byEditor, byViewer, byStranger, byNobody, survived, byOwner, afterwards, again }
  }, room)

  expect(answers.byEditor[0]).toBe(403)
  // One answer for every way of not being the owner, so a refusal says
  // nothing about which link was presented.
  expect(answers.byViewer).toEqual(answers.byEditor)
  expect(answers.byStranger).toEqual(answers.byEditor)
  expect(answers.byNobody).toEqual(answers.byEditor)
  expect(answers.survived).toEqual([200, { password: false }])

  expect(answers.byOwner).toEqual([200, { destroyed: true }])
  expect(answers.afterwards[0]).toBe(410)
  // Twice is not an error, and not permission returning either.
  expect(answers.again[0]).toBe(410)
})

/**
 * Destroying a board with an image on it, against a real room and a local R2.
 *
 * The sweep itself — pages, failures, retries, other boards untouched — is
 * unit-tested in `apps/rooms/src/assets.test.ts` against a bucket in memory.
 * This is the Durable Object calling it with the real binding: a board that
 * holds an image is destroyed, and the image goes with it.
 */
test('destroying a board takes its images with it', async ({ page }) => {
  const room = newRoomId()
  await page.goto(BOARD_URL)
  const base = `http://127.0.0.1:8787/room/${room}`

  const keys = await page.evaluate(async (url) => {
    const claimed = await fetch(`${url}/claim`, { method: 'POST' })
    return (await claimed.json()) as { editor: string; viewer: string; owner: string }
  }, base)

  // `no-store`: the room serves an image as immutable, so without it a second
  // read is answered by this browser's cache and never asks the room.
  const read = () =>
    page.evaluate(
      async ({ url, key }) =>
        (
          await fetch(`${url}/asset/img_one`, {
            headers: { 'x-openframe-key': key },
            cache: 'no-store',
          })
        ).status,
      { url: base, key: keys.viewer },
    )

  const put = await page.evaluate(
    async ({ url, key }) => {
      // The eight bytes every PNG starts with.
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
      const response = await fetch(`${url}/asset/img_one`, {
        method: 'PUT',
        headers: { 'content-type': 'image/png', 'x-openframe-key': key },
        body: png,
      })
      return response.status
    },
    { url: base, key: keys.editor },
  )
  expect(put).toBe(204)
  expect(await read()).toBe(200)
  // Seen in the bucket first, or the check below could never fail.
  expect(await inBucket(`${room}/img_one`)).toBe(true)

  const destroyed = await page.evaluate(
    async ({ url, key }) => {
      const response = await fetch(`${url}/destroy`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      return [response.status, await response.json()] as const
    },
    { url: base, key: keys.owner },
  )
  expect(destroyed).toEqual([200, { destroyed: true }])
  expect(await read()).toBe(410)
  expect(await inBucket(`${room}/img_one`)).toBe(false)
})
