import { richFromPlain } from '@openframe/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

import { applyPatchesToDoc, objectsFromDoc } from './document-map.js'
import {
  createAwareness,
  encodeAwareness,
  encodeSyncStep1,
  encodeSyncStep2,
  decodeTimeReply,
  encodeTimeRequest,
  encodeUpdate,
  readMessage,
  type RoomRole,
} from './protocol.js'
import { BoardRoom, documentFromSnapshot, MAX_MESSAGE_BYTES, type RoomPeer } from './room.js'

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

  /**
   * Editor unless a test says otherwise, because that is what every test
   * written before roles existed assumed — and stating it here rather than
   * defaulting it in `RoomPeer` keeps the production type honest: a peer whose
   * role nobody set is a bug, not an editor.
   */
  constructor(
    readonly id: string,
    readonly role: RoomRole = 'editor',
  ) {}

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
    // `true`: this side's peer is the room, and a client that refused what the
    // room sent it would be refusing the board.
    const { reply } = readMessage(this.doc, this.awareness, message, 'room', true)
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

  /**
   * A snapshot plus the updates that landed after it — which is how storage
   * actually holds a room, because compacting on every edit would rewrite the
   * whole document per keystroke.
   *
   * This exists because the first version of the loader CONCATENATED them into
   * one buffer. Yjs updates are each a complete self-describing message, so the
   * decoder stops after the first and silently drops the rest: the board would
   * have come back as it was at the last compaction, losing up to sixty-four
   * edits, and only ever in production. Concatenating instead of replaying
   * fails this test with `obj_before` alone.
   */
  it('restores a board from a snapshot plus the updates that followed it', () => {
    const first = new BoardRoom()
    sticky(first.doc, 'obj_before', 'saved in the snapshot')
    const snapshot = first.snapshot()

    const trailing: Uint8Array[] = []
    first.doc.on('update', (update: Uint8Array) => trailing.push(update))
    sticky(first.doc, 'obj_after_one', 'after the snapshot')
    sticky(first.doc, 'obj_after_two', 'also after')
    first.destroy()
    expect(trailing.length).toBeGreaterThanOrEqual(2)

    const reopened = documentFromSnapshot([snapshot, ...trailing])

    expect([...objectsFromDoc(reopened).keys()].sort()).toEqual([
      'obj_after_one',
      'obj_after_two',
      'obj_before',
    ])
  })

  it('reopens a board from its snapshot', () => {
    const first = new BoardRoom()
    sticky(first.doc, 'obj_kept', 'survives a restart')
    const stored = first.snapshot()
    first.destroy()

    const reopened = new BoardRoom({ doc: documentFromSnapshot([stored]) })
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

/**
 * One peer's bad message costs that peer, never the room (ADR 0016, hardening).
 *
 * The room runs inside a Durable Object, and an exception out of its message
 * handler is an exception out of the object every peer is connected to. These
 * are bytes off a socket, so a modified or broken client can send anything.
 */
describe('a message the room will not read', () => {
  it('reports a frame that does not decode instead of throwing it', () => {
    const room = new BoardRoom()
    const a = new Client('a')
    a.connect(room)

    // A sync message that promises an update and stops: a truncated frame.
    expect(room.receive(a, new Uint8Array([0, 2, 50, 1]))).toBe('malformed')
    // A sync message with nothing after its type.
    expect(room.receive(a, new Uint8Array([0]))).toBe('malformed')
    // Presence whose payload runs off the end.
    expect(room.receive(a, new Uint8Array([1, 9, 1]))).toBe('malformed')
  })

  it('carries on for everybody else after one', () => {
    const room = new BoardRoom()
    const a = new Client('a')
    const b = new Client('b')
    a.connect(room)
    b.connect(room)
    const heardByB = b.received.length

    room.receive(a, new Uint8Array([0, 2, 50, 1]))
    expect(b.received.length).toBe(heardByB)

    sticky(b.doc, 'obj_after', 'still working')
    expect([...objectsFromDoc(room.doc).keys()]).toEqual(['obj_after'])
    expect([...objectsFromDoc(a.doc).keys()]).toEqual(['obj_after'])
  })

  it('refuses a message over the size it could keep, before reading it', () => {
    const room = new BoardRoom()
    const a = new Client('a')
    const b = new Client('b')
    a.connect(room)
    b.connect(room)
    const heardByB = b.received.length

    // A real, well-formed update, just too big: refused for its size alone.
    const big = new Y.Doc()
    big.getMap('board').set('huge', 'x'.repeat(MAX_MESSAGE_BYTES))
    const update = encodeUpdate(Y.encodeStateAsUpdate(big))
    expect(update.byteLength).toBeGreaterThan(MAX_MESSAGE_BYTES)

    expect(room.receive(a, update)).toBe('too-large')
    expect(room.doc.getMap('board').has('huge')).toBe(false)
    expect(b.received.length).toBe(heardByB)
  })

  /**
   * Publishing a board, or coming back from offline, is the whole state in one
   * frame (`seedDoc`, a sync step 2). A cap sized for a single edit refused
   * those, and the client resent them on every reconnect, so a large board
   * could never be shared.
   */
  it('reads a whole board arriving in one handshake, far larger than any edit', () => {
    const room = new BoardRoom()
    const a = new Client('a')
    a.connect(room)

    // About the size of a ten-thousand-object board.
    const board = new Y.Doc()
    board.getMap('board').set('seeded', 'x'.repeat(5 * 1024 * 1024))
    const step2 = encodeSyncStep2(board, Y.encodeStateVector(room.doc))

    expect(room.receive(a, step2)).toBe('accepted')
    expect(room.doc.getMap('board').get('seeded')).toHaveLength(5 * 1024 * 1024)
  })

  it('still reads a large message that fits', () => {
    const room = new BoardRoom()
    const a = new Client('a')
    a.connect(room)

    const large = new Y.Doc()
    large.getMap('board').set('large', 'x'.repeat(MAX_MESSAGE_BYTES - 1024))
    const update = encodeUpdate(Y.encodeStateAsUpdate(large))
    expect(update.byteLength).toBeLessThanOrEqual(MAX_MESSAGE_BYTES)

    expect(room.receive(a, update)).toBe('accepted')
    expect(room.doc.getMap('board').get('large')).toHaveLength(MAX_MESSAGE_BYTES - 1024)
  })

  it('accepts what it reads, including a type it ignores', () => {
    const room = new BoardRoom()
    const a = new Client('a')
    a.connect(room)
    expect(room.receive(a, encodeSyncStep1(a.doc))).toBe('accepted')
    expect(room.receive(a, new Uint8Array([99, 1, 2, 3]))).toBe('accepted')
  })
})

/**
 * The room's clock, for the session timer (ADR 0017).
 *
 * Every device runs the timer against the ROOM's time, never its own, so two
 * laptops a minute apart still agree to the second. The room answers a
 * question about the time — to the asker, and to nobody else.
 */
describe('the time in the room', () => {
  it('tells only the peer that asked', () => {
    const room = new BoardRoom({ now: () => 5000 })
    const a = new Client('a')
    const b = new Client('b')
    a.connect(room)
    b.connect(room)
    const heardByB = b.received.length

    expect(room.receive(a, encodeTimeRequest(1234))).toBe('accepted')

    expect(decodeTimeReply(a.received.at(-1) ?? new Uint8Array())).toEqual({
      sentAt: 1234,
      roomNow: 5000,
    })
    expect(b.received.length).toBe(heardByB)
  })

  it('answers a viewer, because asking the time is not a write', () => {
    const room = new BoardRoom({ now: () => 7 })
    const viewer = new Client('v', 'viewer')
    viewer.connect(room)
    room.receive(viewer, encodeTimeRequest(1))
    expect(decodeTimeReply(viewer.received.at(-1) ?? new Uint8Array())?.roomNow).toBe(7)
  })

  it('changes nothing about the board', () => {
    let saved = 0
    const room = new BoardRoom({ onDocumentChanged: () => (saved += 1) })
    const a = new Client('a')
    a.connect(room)
    room.receive(a, encodeTimeRequest(1))
    expect(saved).toBe(0)
  })

  it('refuses a question that stops before its time', () => {
    const room = new BoardRoom()
    const a = new Client('a')
    a.connect(room)
    expect(room.receive(a, new Uint8Array([3, 1, 2]))).toBe('malformed')
  })
})

/*
 * A Durable Object cannot hibernate while a timer is pending, and is billed for
 * every second it stays awake. The awareness the room kept ran one every three
 * seconds, so every room with anybody in it was awake, and billed, the whole
 * time — 90% of a day's free allowance on 10-08 (CLAUDE.md rule 29).
 */
describe('a room that can sleep', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps no timer, with nobody in it or with somebody', () => {
    vi.useFakeTimers()
    const room = new BoardRoom()
    expect(vi.getTimerCount()).toBe(0)
    room.join({ id: 'peer', role: 'editor', send: () => undefined })
    expect(vi.getTimerCount()).toBe(0)
  })
})
