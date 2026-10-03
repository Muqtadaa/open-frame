import { expect, test } from '@playwright/test'

import { BOARD_URL } from '../e2e/routes.js'
import { newRoomId } from './rooms.js'

/**
 * A bad frame costs its sender the connection, and nobody else.
 *
 * Against a real Durable Object, because that is where the cost was: an
 * exception out of `webSocketMessage` is an exception out of the object every
 * peer on the board is connected to. `packages/collab/src/room.test.ts` holds
 * the room's half; this is the socket being closed, and the one beside it
 * carrying on (ADR 0016, hardening).
 */
test('a bad frame closes its own socket and leaves the room working', async ({ page }) => {
  const room = newRoomId()
  await page.goto(BOARD_URL)

  const outcome = await page.evaluate(async (id) => {
    const base = `http://127.0.0.1:8787/room/${id}`
    const claimed = await fetch(`${base}/claim`, { method: 'POST' })
    const keys = (await claimed.json()) as { editor: string }

    const open = () =>
      new Promise<WebSocket>((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:8787/room/${id}?k=${keys.editor}`)
        socket.binaryType = 'arraybuffer'
        socket.onopen = () => resolve(socket)
        socket.onerror = () => reject(new Error('socket failed to open'))
      })
    const closeCode = (socket: WebSocket) =>
      new Promise<number>((resolve) => {
        socket.addEventListener('close', (event) => resolve(event.code))
      })
    const nextMessage = (socket: WebSocket) =>
      new Promise<void>((resolve) => {
        socket.addEventListener('message', () => resolve(), { once: true })
      })

    const bystander = await open()

    // Presence whose payload runs off its end: the decoder throws on it.
    const garbled = await open()
    const garbledClosed = closeCode(garbled)
    garbled.send(new Uint8Array([1, 9, 1]))

    // The size cap is the platform's own 32 MiB, so a frame over it would
    // tell us about workerd rather than the room; `room.test.ts` holds it.
    const codes = { garbled: await garbledClosed }

    // The bystander's socket is still there, and the room still answers it:
    // a sync step 1 for an empty document is answered with the board.
    const answered = nextMessage(bystander)
    bystander.send(new Uint8Array([0, 0, 1, 0]))
    await answered
    const stillOpen = bystander.readyState === WebSocket.OPEN
    bystander.close()
    return { ...codes, stillOpen }
  }, room)

  expect(outcome.garbled).toBe(1007)
  expect(outcome.stillOpen).toBe(true)
})
