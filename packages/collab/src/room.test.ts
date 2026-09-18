import { richFromPlain } from '@openframe/core'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { applyPatchesToDoc, objectsFromDoc } from './document-map.js'
import {
  createAwareness,
  encodeAwareness,
  encodeSyncStep1,
  encodeUpdate,
  readMessage,
} from './protocol.js'
import { BoardRoom, documentFromSnapshot, type RoomPeer } from './room.js'

/**
 * A whole board room, with no server in it.
 *
 * Every test here is the room plus objects that have a `send` method. If one of
 * them ever needs a socket, the seam has moved to the wrong place and ADR 0013
 * has stopped being reversible.
 */

/** A client: its own `Y.Doc`, its own awareness, and a wire to the room. */
class Client implements RoomPeer {
  readonly doc = new Y.Doc()
  readonly awareness = createAwareness(this.doc)
  readonly received: Uint8Array[] = []
  #room: BoardRoom | null = null

  constructor(readonly id: string) {}

  /** Sends its own document changes on, the way a real provider would. */
  connect(room: BoardRoom): void {
    this.#room = room
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'room') return
      room.receive(this, encodeUpdate(update))
    })

    room.join(this)
    /*
     * And the client opens with its OWN step 1, which is not politeness — it is
     * the half of the handshake that fetches the board.
     *
     * The first two tests here failed until this line existed, both with an
     * empty document: a client that only ANSWERS the room's step 1 tells the
     * room what it has and is never told what the room has. The sync protocol
     * is symmetric, and each side's step 1 asks for one direction of the diff.
     * The real provider has to do this on open for the same reason.
     */
    room.receive(this, encodeSyncStep1(this.doc))
  }

  send(message: Uint8Array): void {
    this.received.push(message)
    // Applied with a 'room' origin so the observer above does not send the
    // room's own news back to it.
    const { reply } = readMessage(this.doc, this.awareness, message, 'room')
    if (reply !== null && this.#room !== null) this.#room.receive(this, reply)
  }
}

function sticky(doc: Y.Doc, id: string, text: string): void {
  applyPatchesToDoc(doc, [
    {
      op: 'add',
      id: id as never,
      object: {
        id: id as never,
        type: 'sticky',
        dataVersion: 1,
        frame: { x: 0, y: 0, width: 180, height: 120, rotation: 0 },
        parentId: null,
        order: 'a0' as never,
        style: {},
        locked: false,
        hidden: false,
        data: { text: richFromPlain(text) },
        meta: { createdAt: 0, createdBy: null, createdVia: 'user' },
      } as never,
    },
  ])
}

describe('a board room', () => {
  it('catches a joining client up on what is already there', () => {
    const room = new BoardRoom()
    sticky(room.doc, 'obj_existing', 'already here')

    const late = new Client('late')
    late.connect(room)

    expect([...objectsFromDoc(late.doc).keys()]).toEqual(['obj_existing'])
  })

  it('carries one client edit to another', () => {
    const room = new BoardRoom()
    const a = new Client('a')
    const b = new Client('b')
    a.connect(room)
    b.connect(room)

    sticky(a.doc, 'obj_from_a', 'hello')

    expect([...objectsFromDoc(b.doc).keys()]).toEqual(['obj_from_a'])
    expect([...objectsFromDoc(room.doc).keys()]).toEqual(['obj_from_a'])
  })

  it('never sends a client its own change back', () => {
    const room = new BoardRoom()
    const a = new Client('a')
    const b = new Client('b')
    a.connect(room)
    b.connect(room)
    const before = a.received.length

    sticky(a.doc, 'obj_from_a', 'hello')

    expect(a.received.length).toBe(before)
    expect(b.received.length).toBeGreaterThan(0)
  })

  it('converges three clients that all edit at once', () => {
    const room = new BoardRoom()
    const clients = ['a', 'b', 'c'].map((id) => new Client(id))
    for (const client of clients) client.connect(room)

    for (const client of clients) sticky(client.doc, `obj_${client.id}`, client.id)

    const expected = ['obj_a', 'obj_b', 'obj_c']
    for (const client of clients) {
      expect([...objectsFromDoc(client.doc).keys()].sort()).toEqual(expected)
    }
    expect([...objectsFromDoc(room.doc).keys()].sort()).toEqual(expected)
  })

  it('saves the document but not presence', () => {
    let saves = 0
    const room = new BoardRoom({ onDocumentChanged: () => saves++ })
    const a = new Client('a')
    a.connect(room)

    sticky(a.doc, 'obj_one', 'one')
    const afterEdit = saves
    expect(afterEdit).toBeGreaterThan(0)

    /*
     * A cursor moving is not history. Persisting it would mean a storage write
     * per mouse move, to save something meaningless the moment the tab closes.
     */
    a.awareness.setLocalState({ cursor: { x: 10, y: 10 } })
    room.receive(a, encodeAwareness(a.awareness, [a.doc.clientID]))
    expect(saves).toBe(afterEdit)
  })

  it('reopens a board from its snapshot', () => {
    const first = new BoardRoom()
    sticky(first.doc, 'obj_kept', 'survives a restart')
    const stored = first.snapshot()
    first.destroy()

    const reopened = new BoardRoom({ doc: documentFromSnapshot(stored) })
    const late = new Client('late')
    late.connect(reopened)

    expect([...objectsFromDoc(late.doc).keys()]).toEqual(['obj_kept'])
  })
})

describe('presence', () => {
  it('shows a newcomer who is already in the room', () => {
    const room = new BoardRoom()
    const a = new Client('a')
    a.connect(room)
    a.awareness.setLocalState({ name: 'Ada' })
    room.receive(a, encodeAwareness(a.awareness, [a.doc.clientID]))

    const b = new Client('b')
    b.connect(room)

    expect(b.awareness.getStates().get(a.doc.clientID)).toEqual({ name: 'Ada' })
  })

  /**
   * The failure this prevents is a ghost: a cursor belonging to somebody who
   * closed the tab, which every other client goes on drawing forever because
   * nothing will ever move it again.
   */
  it('takes a cursor away when its client disconnects', () => {
    const room = new BoardRoom()
    const a = new Client('a')
    const b = new Client('b')
    a.connect(room)
    b.connect(room)

    a.awareness.setLocalState({ name: 'Ada' })
    room.receive(a, encodeAwareness(a.awareness, [a.doc.clientID]))
    expect(b.awareness.getStates().has(a.doc.clientID)).toBe(true)

    room.leave(a)

    expect(b.awareness.getStates().has(a.doc.clientID)).toBe(false)
    expect(room.peerCount).toBe(1)
  })

  it('does not relay a sync handshake to the rest of the room', () => {
    const room = new BoardRoom()
    const a = new Client('a')
    const b = new Client('b')
    a.connect(room)
    b.connect(room)
    const before = b.received.length

    // A step-1 is a question about what the SENDER has. Relaying it would have
    // every other client answer a peer that never asked them anything.
    room.receive(a, encodeSyncStep1(a.doc))

    expect(b.received.length).toBe(before)
  })
})

describe('a peer speaking a language the room does not know', () => {
  it('ignores an unknown message type instead of taking the room down', () => {
    const room = new BoardRoom()
    const a = new Client('a')
    a.connect(room)

    // Message type 99: a client from a future version, mid rolling deploy.
    expect(() => {
      room.receive(a, new Uint8Array([99, 1, 2, 3]))
    }).not.toThrow()

    sticky(a.doc, 'obj_after', 'still working')
    expect([...objectsFromDoc(room.doc).keys()]).toEqual(['obj_after'])
  })
})
