import { idleTimer, playMusic, startTimer, stoppedMusic } from '@openframe/core/facilitation'
import { createTestHarness } from '@openframe/core/testing'
import { describe, expect, it } from 'vitest'

import { connectBoard } from './connect.js'
import type { RoomSocket } from './provider.js'
import { BoardRoom, type RoomPeer } from './room.js'

/**
 * The session timer as an application sees it: through a `BoardConnection`,
 * with no Yjs type in sight (ADR 0017).
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

  connectTo(room: BoardRoom, id: string): void {
    this.#room = room
    this.#peer = {
      id,
      role: 'editor',
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

async function open(room: BoardRoom) {
  const h = createTestHarness()
  const id = `peer-${String(++joined)}`
  const connection = await connectBoard({
    store: h.store,
    dispatcher: h.dispatcher,
    seed: false,
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
  return connection
}

describe('the session timer on a connection', () => {
  it('reaches everyone in the room, and reads the same until it changes', async () => {
    const room = new BoardRoom()
    const facilitator = await open(room)
    const participant = await open(room)
    const heard: unknown[] = []
    participant.onFacilitation((state) => heard.push(state.timer))
    expect(heard).toEqual([null])
    expect(participant.facilitation().music).toBeNull()

    const timer = startTimer(idleTimer(), 1000, 'Ada')
    facilitator.writeTimer(timer)

    expect(participant.facilitation().timer).toEqual(timer)
    expect(heard.at(-1)).toEqual(timer)
    // The same object each time it is asked, so a React store does not render forever (rule 9).
    expect(participant.facilitation()).toBe(participant.facilitation())
    const music = playMusic(stoppedMusic('ambient-lofi'), 2000, 'Ada', [
      { id: 'calm-1', durationMs: 60_000 },
    ])
    facilitator.writeMusic(music)
    expect(participant.facilitation().music).toEqual(music)
    facilitator.destroy()
    participant.destroy()
  })

  it('runs on the room’s clock, whatever this device’s says', async () => {
    const room = new BoardRoom({ now: () => Date.now() + 60_000 })
    const connection = await open(room)
    expect(connection.clockSynced).toBe(true)
    expect(Math.abs(connection.serverNow() - (Date.now() + 60_000))).toBeLessThan(50)
    connection.destroy()
  })
})
