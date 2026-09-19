import { richFromPlain, type AnyOpenFrameObject, type ObjectId } from '@openframe/core'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { applyPatchesToDoc, objectsFromDoc } from './document-map.js'
import { createAwareness, type RoomRole } from './protocol.js'
import { RoomProvider, type RoomSocket } from './provider.js'
import { BoardRoom, type RoomPeer } from './room.js'

/**
 * The client provider against a real `BoardRoom`, joined by fake sockets.
 *
 * This is the closest thing to an end-to-end test that exists before anything
 * is deployed, and it still runs in one process with no network: `Wire` is the
 * only thing standing in for a WebSocket, and it is twenty lines.
 */

/** A socket pair. One end is the client's, the other is the room's peer. */
class Wire {
  #open = false
  #openListeners: (() => void)[] = []
  #messageListeners: ((data: Uint8Array) => void)[] = []
  #closeListeners: (() => void)[] = []
  #room: BoardRoom | null = null
  #peer: RoomPeer | null = null
  /** Messages the client sent while the socket was not up. */
  delivered = 0

  readonly client: RoomSocket = {
    send: (data) => {
      if (!this.#open || this.#room === null || this.#peer === null) return
      this.delivered++
      this.#room.receive(this.#peer, data)
    },
    close: () => {
      this.drop()
    },
    onOpen: (listener) => this.#openListeners.push(listener),
    onMessage: (listener) => this.#messageListeners.push(listener),
    onClose: (listener) => this.#closeListeners.push(listener),
    onError: () => undefined,
  }

  /** Completes the connection, as a server accepting the upgrade would. */
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

  drop(): void {
    if (!this.#open) return
    this.#open = false
    if (this.#room !== null && this.#peer !== null) this.#room.leave(this.#peer)
    for (const listener of this.#closeListeners) listener()
  }
}

/** A client: its own document, its own provider, its own wire into the room. */
function client(room: BoardRoom, id: string) {
  const doc = new Y.Doc()
  const awareness = createAwareness(doc)
  const wires: Wire[] = []
  const statuses: string[] = []

  const provider = new RoomProvider({
    doc,
    awareness,
    onStatus: (status) => statuses.push(status),
    connect: () => {
      const wire = new Wire()
      wires.push(wire)
      // Connected synchronously, which is what a test wants: a real socket's
      // open event is the only thing that differs, and it is awaited below.
      queueMicrotask(() => {
        wire.connectTo(room, `${id}-${String(wires.length)}`)
      })
      return wire.client
    },
    // Retries run immediately rather than after a real delay.
    setTimer: (run) => {
      queueMicrotask(run)
      return null
    },
    clearTimer: () => undefined,
  })

  return { doc, awareness, provider, wires, statuses }
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

function sticky(doc: Y.Doc, id: string, text: string): void {
  applyPatchesToDoc(doc, [
    {
      op: 'add',
      id: id as ObjectId,
      object: {
        id: id as ObjectId,
        type: 'sticky',
        dataVersion: 1,
        frame: { x: 0, y: 0, width: 180, height: 120, rotation: 0 },
        parentId: null,
        order: 'a0',
        style: {},
        locked: false,
        hidden: false,
        data: { text: richFromPlain(text) },
        meta: { createdAt: 0, createdBy: null, createdVia: 'user' },
      } as unknown as AnyOpenFrameObject,
    },
  ])
}

describe('a client joining a room', () => {
  it('receives a board that was already there', async () => {
    const room = new BoardRoom()
    sticky(room.doc, 'obj_existing', 'already here')

    const a = client(room, 'a')
    a.provider.start()
    await settle()

    expect([...objectsFromDoc(a.doc).keys()]).toEqual(['obj_existing'])
    expect(a.provider.status).toBe('connected')
  })

  it('carries an edit to another client', async () => {
    const room = new BoardRoom()
    const a = client(room, 'a')
    const b = client(room, 'b')
    a.provider.start()
    b.provider.start()
    await settle()

    sticky(a.doc, 'obj_from_a', 'hello')
    await settle()

    expect([...objectsFromDoc(b.doc).keys()]).toEqual(['obj_from_a'])
  })

  it('shows one client another one arriving', async () => {
    const room = new BoardRoom()
    const a = client(room, 'a')
    a.provider.start()
    await settle()
    a.awareness.setLocalState({ name: 'Ada' })
    await settle()

    const b = client(room, 'b')
    b.provider.start()
    await settle()

    expect(b.awareness.getStates().get(a.doc.clientID)).toEqual({ name: 'Ada' })
  })
})

describe('a connection that drops', () => {
  it('reconnects and catches up on what it missed', async () => {
    const room = new BoardRoom()
    const a = client(room, 'a')
    const b = client(room, 'b')
    a.provider.start()
    b.provider.start()
    await settle()

    // b goes away, and the board moves on without it.
    b.wires[0]?.drop()
    await settle()
    sticky(a.doc, 'obj_while_away', 'happened while b was gone')
    await settle()

    // The reconnect is automatic, and the handshake fetches what was missed.
    expect(b.wires.length).toBeGreaterThan(1)
    expect([...objectsFromDoc(b.doc).keys()]).toEqual(['obj_while_away'])
    expect(b.provider.status).toBe('connected')
  })

  /**
   * Edits made offline are not lost. They are in the client's own `Y.Doc`, and
   * the handshake on reconnection is what carries them up — which is the
   * property that makes "disconnection loses nothing" true rather than hoped.
   */
  it('sends up the work done while it was offline', async () => {
    const room = new BoardRoom()
    const a = client(room, 'a')
    const b = client(room, 'b')
    a.provider.start()
    b.provider.start()
    await settle()

    b.wires[0]?.drop()
    await settle()
    sticky(b.doc, 'obj_made_offline', 'written with no connection')
    await settle()

    expect([...objectsFromDoc(a.doc).keys()]).toEqual(['obj_made_offline'])
    expect([...objectsFromDoc(room.doc).keys()]).toEqual(['obj_made_offline'])
  })

  it('reports what it is doing, so the interface can say so', async () => {
    const room = new BoardRoom()
    const a = client(room, 'a')
    a.provider.start()
    await settle()
    expect(a.statuses).toEqual(['connecting', 'connected'])

    a.wires[0]?.drop()
    await settle()
    expect(a.statuses).toEqual(['connecting', 'connected', 'connecting', 'connected'])

    a.provider.destroy()
    expect(a.statuses.at(-1)).toBe('offline')
  })

  it('stops reconnecting once it is destroyed', async () => {
    const room = new BoardRoom()
    const a = client(room, 'a')
    a.provider.start()
    await settle()
    const opened = a.wires.length

    a.provider.destroy()
    await settle()

    expect(a.wires.length).toBe(opened)
    expect(a.provider.status).toBe('offline')
  })
})
