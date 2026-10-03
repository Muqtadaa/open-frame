import { expect, test } from '@playwright/test'

import { BOARD_URL } from '../e2e/routes.js'
import { newRoomId } from './rooms.js'

/**
 * Whether a board asks for a password, answered by a real room.
 *
 * The front door's tag is driven by a stubbed network in `board-ledger.spec`;
 * this is the room itself: either link and the owner are told, a wrong key is
 * told nothing, and the answer changes when a password is set and cleared.
 */
test('a room tells its key holders whether it asks for a password', async ({ page }) => {
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

    const before = await post('protection', { key: keys.viewer })
    await post('password', { key: keys.owner, password: 'correct horse' })
    const after = await Promise.all([
      post('protection', { key: keys.editor }),
      post('protection', { key: keys.viewer }),
      post('protection', { key: keys.owner }),
    ])
    const stranger = await post('protection', { key: 'x'.repeat(32) })
    await post('password', { key: keys.owner, password: null })
    const cleared = await post('protection', { key: keys.editor })
    return { before, after, stranger, cleared }
  }, room)

  expect(answers.before).toEqual([200, { password: false }])
  for (const answer of answers.after) expect(answer).toEqual([200, { password: true }])
  // Nothing about the board, including whether it has a password.
  expect(answers.stranger[0]).toBe(403)
  expect(JSON.stringify(answers.stranger[1])).not.toContain('password":')
  expect(answers.cleared).toEqual([200, { password: false }])
})

/**
 * Guessing at a board's password, against a real room.
 *
 * The arithmetic is unit-tested in `apps/rooms/src/password.test.ts`. This is
 * the room honouring it: a handful of wrong guesses are free, then it stops
 * looking — at the right password too, or the wait would tell a guesser
 * nothing — and it lets the right one in once the wait is over.
 */
test('a room rations guesses at its password', async ({ page }) => {
  const room = newRoomId()
  await page.goto(BOARD_URL)
  const base = `http://127.0.0.1:8787/room/${room}`

  const keys = await page.evaluate(async (url) => {
    const claimed = await fetch(`${url}/claim`, { method: 'POST' })
    const minted = (await claimed.json()) as { editor: string; viewer: string; owner: string }
    await fetch(`${url}/password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: minted.owner, password: 'correct horse' }),
    })
    return minted
  }, base)

  const attempt = (password: string) =>
    page.evaluate(
      async ({ url, key, guess }) => {
        const response = await fetch(`${url}/unlock`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key, password: guess }),
        })
        return [response.status, response.headers.get('retry-after')] as const
      },
      { url: base, key: keys.viewer, guess: password },
    )

  // Five free, and the sixth earns the first wait.
  const guesses = []
  for (let i = 0; i < 6; i++) guesses.push(await attempt(`wrong ${String(i)}`))
  expect(guesses.map(([status]) => status)).toEqual([403, 403, 403, 403, 403, 403])

  const [status, retryAfter] = await attempt('correct horse')
  expect(status).toBe(429)
  expect(Number(retryAfter)).toBeGreaterThanOrEqual(1)

  // Once the wait is over, the right password opens it.
  await expect.poll(async () => (await attempt('correct horse'))[0]).toBe(200)
})
