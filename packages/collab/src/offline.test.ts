import { richFromPlain, type AnyOpenFrameObject, type ObjectId } from '@openframe/core'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { applyPatchesToDoc, objectsFromDoc } from './document-map.js'
import { createAwareness, type RoomRole } from './protocol.js'
import { RoomProvider, type RoomSocket } from './provider.js'
import { BoardRoom, type RoomPeer } from './room.js'

/**
 * Work done in a later session reaching the room.
 *
 * The oldest open item in Phase 4, recorded as "traced rather than
 * reproduced". Reproducing it corrected it: the note said offline edits after
 * the first session never reach the room, and that is not what happens.
 *
 * What is true: a `Y.Doc` is built fresh on every page load and nothing
 * persists it, so every session after the first starts from an EMPTY CRDT
 * while the document on screen comes from IndexedDB and is full. An `add`
 * made in that state is self-contained and syncs fine — which is why the
 * original trace looked wrong in the other direction.
 *
 * A `set` does not. `applyPatchesToDoc` DROPS a `set` against an object the
 * doc does not hold, deliberately and correctly: across a network it means
 * somebody deleted the object while the edit was in flight. But in an empty
 * doc it means every object on the board, so moving a note, recolouring it or
 * editing its text writes nothing into the CRDT at all.
 *
 * Online the window closes when the room's state arrives. Offline it never
 * does — an afternoon of rearranging a board reaches the screen and IndexedDB
 * and is never seen by the room or by anybody else. PRODUCT.md promises that
 * nothing is lost while the connection is gone; this is where it is.
 */

class Wire {
  #open = false
  #openListeners: (() => void)[] = []
  #messageListeners: ((data: Uint8Array) => void)[] = []
  #closeListeners: ((code: number) => void)[] = []
  #room: BoardRoom | null = null
  #peer: RoomPeer | null = null

  readonly client: RoomSocket = {
    send: (data) => {
      if (!this.#open || this.#room === null || this.#peer === null) return
      this.#room.receive(this.#peer, data)
    },
    close: () => this.drop(),
    onOpen: (listener) => this.#openListeners.push(listener),
    onMessage: (listener) => this.#messageListeners.push(listener),
    onClose: (listener) => this.#closeListeners.push(listener),
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

  drop(): void {
    if (!this.#open) return
    this.#open = false
    if (this.#room !== null && this.#peer !== null) this.#room.leave(this.#peer)
    for (const listener of this.#closeListeners) listener(1006)
  }
}

/**
 * One browser session on one board.
 *
 * `state` is what this browser had stored for the board's CRDT when the
 * session began — `null` for a browser that has never persisted one, which is
 * every session today.
 */
function session(room: BoardRoom, id: string, state: Uint8Array | null) {
  const doc = new Y.Doc()
  if (state !== null) Y.applyUpdate(doc, state)

  const awareness = createAwareness(doc)
  const wires: Wire[] = []

  const provider = new RoomProvider({
    doc,
    awareness,
    onStatus: () => undefined,
    connect: () => {
      const wire = new Wire()
      wires.push(wire)
      queueMicrotask(() => wire.connectTo(room, `${id}-${String(wires.length)}`))
      return wire.client
    },
    setTimer: (run) => {
      queueMicrotask(run)
      return null
    },
    clearTimer: () => undefined,
  })

  /*
   * Being offline is modelled as NOT HAVING STARTED the provider, and coming
   * online as starting it. That is deliberate and it is the honest shape: the
   * question here is whether a doc that already holds work pushes it on
   * connect, and the reconnection loop itself is `provider.test.ts`'s job.
   *
   * The first attempt at this instead called `start()` twice, once "offline".
   * `start()` returns early when a socket already exists, so the second call
   * did nothing and the test reported a product bug that was its own.
   */
  return {
    doc,
    provider,
    /** What this browser would have stored, had it stored anything. */
    snapshot: () => Y.encodeStateAsUpdate(doc),
  }
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 12; i += 1) await Promise.resolve()
}

function moveTo(doc: Y.Doc, id: string, x: number): void {
  applyPatchesToDoc(doc, [
    { op: 'set', id: id as ObjectId, path: ['frame', 'x'], value: x },
  ])
}

function retitle(doc: Y.Doc, id: string, text: string): void {
  applyPatchesToDoc(doc, [
    { op: 'set', id: id as ObjectId, path: ['data', 'text'], value: richFromPlain(text) },
  ])
}

/** `RichText` is a flat span array — `[{ text }]` — not a wrapper object. */
function plainText(object: AnyOpenFrameObject | undefined): string {
  const data = object?.data as { text?: { text?: string }[] } | undefined
  return (data?.text ?? []).map((span) => span.text ?? '').join('')
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

describe('work done offline in a later session', () => {
  /**
   * The half that works, asserted so the fix is not credited with it. A new
   * object carries its whole self, so an empty CRDT is no obstacle.
   */
  it('carries a NEW object to the room even with no persisted CRDT', async () => {
    const room = new BoardRoom()

    // Session one: online, publishes the board.
    const first = session(room, 'first', null)
    first.provider.start()
    await settle()
    sticky(first.doc, 'obj_from_session_one', 'published')
    await settle()
    expect([...objectsFromDoc(room.doc).keys()]).toEqual(['obj_from_session_one'])
    first.provider.destroy()

    // Session two: a reload. Nothing was persisted, so the doc starts empty.
    const second = session(room, 'second', null)

    // Offline work: the provider has not connected.
    sticky(second.doc, 'obj_made_offline', 'written on a plane')

    // The network comes back.
    second.provider.start()
    await settle()

    expect([...objectsFromDoc(room.doc).keys()].sort()).toEqual([
      'obj_from_session_one',
      'obj_made_offline',
    ])
    second.provider.destroy()
  })

  /**
   * THE BUG, in the form it actually takes.
   *
   * Editing something already on the board — which is most of what anyone
   * does — writes nothing into an empty CRDT, so the room never learns it and
   * no later sync can recover it. The change is on screen and in IndexedDB,
   * and it is gone from everybody else's board forever.
   */
  it('LOSES an edit to an object already on the board, with no persisted CRDT', async () => {
    const room = new BoardRoom()

    const first = session(room, 'first', null)
    first.provider.start()
    await settle()
    sticky(first.doc, 'obj_note', 'first draft')
    await settle()
    first.provider.destroy()

    // Session two: a reload, nothing persisted, so the CRDT is empty while
    // the board on screen is not.
    const second = session(room, 'second', null)

    // Offline: move the note and rewrite it. Ordinary work.
    moveTo(second.doc, 'obj_note', 640)
    retitle(second.doc, 'obj_note', 'second draft')

    second.provider.start()
    await settle()

    const inRoom = objectsFromDoc(room.doc).get('obj_note' as ObjectId)
    expect(inRoom).toBeDefined()
    // Neither change arrived. The room still holds the first draft, where it
    // was left.
    expect(inRoom?.frame.x).toBe(0)
    expect(plainText(inRoom)).toBe('first draft')
    second.provider.destroy()
  })

  /**
   * WITH persistence. The same sequence, with the one difference that the
   * second session begins from the CRDT state the first one left behind.
   */
  it('keeps an edit to an existing object when the CRDT is persisted', async () => {
    const room = new BoardRoom()

    const first = session(room, 'first', null)
    first.provider.start()
    await settle()
    sticky(first.doc, 'obj_note', 'first draft')
    await settle()
    const stored = first.snapshot()
    first.provider.destroy()

    const second = session(room, 'second', stored)
    moveTo(second.doc, 'obj_note', 640)
    retitle(second.doc, 'obj_note', 'second draft')

    second.provider.start()
    await settle()

    const inRoom = objectsFromDoc(room.doc).get('obj_note' as ObjectId)
    expect(inRoom?.frame.x).toBe(640)
    expect(plainText(inRoom)).toBe('second draft')
    second.provider.destroy()
  })

  it('still carries a new object when the CRDT is persisted', async () => {
    const room = new BoardRoom()

    const first = session(room, 'first', null)
    first.provider.start()
    await settle()
    sticky(first.doc, 'obj_from_session_one', 'published')
    await settle()
    const stored = first.snapshot()
    first.provider.destroy()

    // Session two starts from what session one left behind, edits offline,
    // and only then connects.
    const second = session(room, 'second', stored)
    sticky(second.doc, 'obj_made_offline', 'written on a plane')

    second.provider.start()
    await settle()

    expect([...objectsFromDoc(room.doc).keys()].sort()).toEqual([
      'obj_from_session_one',
      'obj_made_offline',
    ])
    second.provider.destroy()
  })

  /**
   * And the reason the seed-once rule exists, stated as a test: a persisted
   * CRDT carries DELETION history, so rejoining does not resurrect what
   * somebody else removed. This is what makes persistence safe to rely on
   * instead of the localStorage flag.
   */
  it('does not resurrect what another client deleted', async () => {
    const room = new BoardRoom()

    const first = session(room, 'first', null)
    first.provider.start()
    await settle()
    sticky(first.doc, 'obj_shared', 'here for now')
    await settle()
    const stored = first.snapshot()
    first.provider.destroy()

    // Somebody else deletes it while this browser is away.
    applyPatchesToDoc(room.doc, [{ op: 'remove', id: 'obj_shared' as ObjectId }])

    const second = session(room, 'second', stored)
    second.provider.start()
    await settle()

    expect([...objectsFromDoc(room.doc).keys()]).toEqual([])
    expect([...objectsFromDoc(second.doc).keys()]).toEqual([])
    second.provider.destroy()
  })
})
