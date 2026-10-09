import { expect, test } from '@playwright/test'

import { BOARD_URL } from '../e2e/routes.js'
import { newRoomId } from './rooms.js'

/**
 * Who a connection is, said in its first message and never in its address.
 *
 * Against a real Durable Object, because the address is what the platform
 * logs and the attachment is what survives an eviction: both are workerd's.
 * `access.test.ts` holds the decisions; this is the room making them.
 */
test('a socket is admitted by its hello, and sent nothing before it', async ({ page }) => {
  const room = newRoomId()
  await page.goto(BOARD_URL)

  const outcome = await page.evaluate(async (id) => {
    const base = `http://127.0.0.1:8787/room/${id}`
    const claimed = await fetch(`${base}/claim`, { method: 'POST' })
    const keys = (await claimed.json()) as { editor: string }
    const hello = (key: string) =>
      new Uint8Array([5, key.length, ...new TextEncoder().encode(key), 0, 0])

    const socketTo = (url: string) =>
      new Promise<WebSocket | 'refused'>((resolve) => {
        const socket = new WebSocket(url)
        socket.binaryType = 'arraybuffer'
        socket.onopen = () => resolve(socket)
        socket.onerror = () => resolve('refused')
      })
    const closeCode = (socket: WebSocket) =>
      new Promise<number>((resolve) => {
        socket.addEventListener('close', (event) => resolve(event.code))
      })
    const firstMessage = (socket: WebSocket) =>
      new Promise<Uint8Array>((resolve) => {
        socket.addEventListener('message', (event) => resolve(new Uint8Array(event.data)), {
          once: true,
        })
      })

    // A credential in the address is an older client, told so at once.
    const inAddress = await socketTo(`ws://127.0.0.1:8787/room/${id}?k=${keys.editor}`)

    // Silent: open, and never introduced.
    const silent = await socketTo(`ws://127.0.0.1:8787/room/${id}`)
    if (silent === 'refused') throw new Error('the room refused a plain socket')
    let silentHeard = 0
    silent.addEventListener('message', () => {
      silentHeard++
    })

    // Introduced with the edit link: its first answer is the role (type 2).
    const member = await socketTo(`ws://127.0.0.1:8787/room/${id}`)
    if (member === 'refused') throw new Error('the room refused a plain socket')
    const answered = firstMessage(member)
    member.send(hello(keys.editor))
    const role = await answered

    // Introduced with a link that does not open this board.
    const stranger = await socketTo(`ws://127.0.0.1:8787/room/${id}`)
    if (stranger === 'refused') throw new Error('the room refused a plain socket')
    const strangerClosed = closeCode(stranger)
    stranger.send(hello('x'.repeat(32)))

    // Anything but a hello first closes the socket.
    const silentClosed = closeCode(silent)
    silent.send(new Uint8Array([0, 0, 1, 0]))

    const codes = { stranger: await strangerClosed, silent: await silentClosed }
    member.close()
    return {
      inAddress: inAddress === 'refused',
      role: [...role.slice(0, 1)],
      silentHeard,
      ...codes,
    }
  }, room)

  expect(outcome.inAddress).toBe(true)
  expect(outcome.role).toEqual([2])
  expect(outcome.silentHeard).toBe(0)
  expect(outcome.stranger).toBe(1008)
  expect(outcome.silent).toBe(1008)
})

/*
 * Counted at the door, because a room in use never sleeps: the wake that
 * closes the silent would not come, and a stranger with a board id could
 * otherwise hold every socket the room has (Codex, on #105).
 */
test('turns a newcomer away while too many are waiting to say who they are', async ({ page }) => {
  const room = newRoomId()
  await page.goto(BOARD_URL)

  const outcome = await page.evaluate(
    async ({ id, waiting }) => {
      const socketTo = () =>
        new Promise<WebSocket | 'refused'>((resolve) => {
          const socket = new WebSocket(`ws://127.0.0.1:8787/room/${id}`)
          socket.onopen = () => resolve(socket)
          socket.onerror = () => resolve('refused')
        })
      const silent: (WebSocket | 'refused')[] = []
      for (let n = 0; n < waiting; n++) silent.push(await socketTo())
      const oneMore = await socketTo()
      for (const socket of silent) if (socket !== 'refused') socket.close()
      return {
        opened: silent.filter((socket) => socket !== 'refused').length,
        oneMoreRefused: oneMore === 'refused',
      }
    },
    { id: room, waiting: 32 },
  )

  expect(outcome.opened).toBe(32)
  expect(outcome.oneMoreRefused).toBe(true)
})
