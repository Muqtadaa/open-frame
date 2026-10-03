import { expect, test } from '@playwright/test'

import { BOARD_URL } from '../e2e/routes.js'
import { newRoomId } from './rooms.js'

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
