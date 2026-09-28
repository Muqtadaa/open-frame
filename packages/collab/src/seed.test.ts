import { richFromPlain } from '@openframe/core'
import { createTestHarness } from '@openframe/core/testing'
import { describe, expect, it } from 'vitest'

import { connectBoard } from './connect.js'
import type { RoomRole } from './protocol.js'
import type { RoomSocket } from './provider.js'
import { BoardRoom, type RoomPeer } from './room.js'

/**
 * Who publishes a board into its room, and when.
 *
 * A browser that had never held a board's CRDT published whatever it had on
 * screen — and a device opening a shared board for the first time has only
 * the empty document it made up a moment ago, called "Untitled board". That
 * write was concurrent with the room's real title, Yjs broke the tie by client
 * id, and so on roughly half of all first opens the board was "Untitled board"
 * — on that device for good, and, for an editor, on everybody's (reported by
 * the owner: the list showed the name, the open board did not).
 *
 * The rule now: publish only once the room has answered, and only into a room
 * that has no board in it. A room with a board is the truth for a newcomer.
 */

class Wire {
  #open = false
  #openListeners: (() => void)[] = []
  #messageListeners: ((data: Uint8Array) => void)[] = []
  #room: BoardRoom | null = null
  #peer: RoomPeer | null = null

  readonly client: RoomSocket = {
    send: (data) => {
      if (!this.#open || this.#room === null || this.#peer === null) return
      this.#room.receive(this.#peer, data)
    },
    close: () => undefined,
    onOpen: (listener) => this.#openListeners.push(listener),
    onMessage: (listener) => this.#messageListeners.push(listener),
    onClose: () => undefined,
    onError: () => undefined,
  }

  connectTo(room: BoardRoom, id: string, role: RoomRole = 'editor'): void {
    this.#room = room
    this.#peer = {
      id,
      role,
      send: (data) => {
        for (const listener of this.#messageListeners) listener(data)
      },
    }
    this.#open = true
    for (const listener of this.#openListeners) listener()
    room.join(this.#peer)
  }
}

let joined = 0

/** A browser opening the board: `title` is what it had on screen before the room answered. */
async function open(room: BoardRoom, title: string, notes: readonly string[] = []) {
  const h = createTestHarness()
  const renamed = h.dispatcher.dispatch({ kind: 'SetBoardTitle', title })
  if (!renamed.ok) throw renamed.error
  for (const text of notes) {
    const made = h.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ type: 'sticky', x: 0, y: 0, data: { text: richFromPlain(text) } }],
    })
    if (!made.ok) throw made.error
  }
  const id = `peer-${String(++joined)}`
  const connection = await connectBoard({
    store: h.store,
    dispatcher: h.dispatcher,
    connect: () => {
      const wire = new Wire()
      setTimeout(() => {
        wire.connectTo(room, id)
      }, 0)
      return wire.client
    },
    onError: (error) => {
      throw error
    },
  })
  await new Promise<void>((resolve) => connection.onSynced(resolve))
  await new Promise((resolve) => setTimeout(resolve, 5))
  return { ...h, connection }
}

const titleOf = (peer: Awaited<ReturnType<typeof open>>) => peer.store.getDocument().meta.title

describe('opening a shared board for the first time', () => {
  it('shows the room’s name, never the blank one it started from', async () => {
    const room = new BoardRoom()
    const owner = await open(room, 'Pricing research', ['a note'])

    /*
     * Many newcomers, because the old failure was a coin toss on Yjs client
     * ids: a single one passed about half the time with the bug present.
     */
    for (let index = 0; index < 12; index += 1) {
      const newcomer = await open(room, 'Untitled board')
      expect(titleOf(newcomer)).toBe('Pricing research')
      expect(newcomer.store.getDocument().objects.size).toBe(1)
      newcomer.connection.destroy()
    }
    expect(titleOf(owner)).toBe('Pricing research')
    owner.connection.destroy()
  })

  it('still publishes a board into a room that has none', async () => {
    const room = new BoardRoom()
    const owner = await open(room, 'Pricing research', ['a note'])
    const other = await open(room, 'Untitled board')

    expect(titleOf(other)).toBe('Pricing research')
    expect(other.store.getDocument().objects.size).toBe(1)
    owner.connection.destroy()
    other.connection.destroy()
  })
})
