import {
  asObjectId,
  createSequentialIdGenerator,
  findParentCycle,
  richFromPlain,
  type AnyOpenFrameObject,
  type ObjectId,
} from '@openframe/core'
import { createTestHarness } from '@openframe/core/testing'
import { beforeEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { objectsFromDoc } from './document-map.js'
import { CollabSession } from './session.js'

/**
 * Two clients, joined by their update streams and nothing else.
 *
 * No server, no sockets, no timers. A sync protocol is deterministic, so if
 * testing it needs a network then the seam is in the wrong place — which is the
 * claim ADR 0013 rests on, tested here rather than asserted.
 */

/** The origin the test harness applies updates with — never OpenFrame's own. */
const WIRE = 'test:wire'

class Wire {
  readonly #docs: Y.Doc[]
  readonly #pending = new Map<Y.Doc, Uint8Array[]>()
  #connected = true

  constructor(docs: Y.Doc[]) {
    this.#docs = docs
    for (const doc of docs) {
      this.#pending.set(doc, [])
      doc.on('update', (update: Uint8Array, origin: unknown) => {
        // Never re-broadcast what the wire itself just delivered.
        if (origin === WIRE) return
        if (this.#connected) this.#deliver(doc, update)
        else this.#pending.get(doc)?.push(update)
      })
    }
  }

  #deliver(from: Y.Doc, update: Uint8Array): void {
    for (const doc of this.#docs) {
      if (doc !== from) Y.applyUpdate(doc, update, WIRE)
    }
  }

  disconnect(): void {
    this.#connected = false
  }

  /** Flushes everything that happened while apart, in the order it happened. */
  reconnect(): void {
    this.#connected = true
    for (const [from, updates] of this.#pending) {
      for (const update of updates.splice(0)) this.#deliver(from, update)
    }
  }
}

function peer(seed: number): ReturnType<typeof createTestHarness> & {
  doc: Y.Doc
  session: CollabSession
} {
  const harness = createTestHarness({ ids: createSequentialIdGenerator(seed) })
  const doc = new Y.Doc()
  const session = CollabSession.join({
    doc,
    dispatcher: harness.dispatcher,
    // A merge these tests did not expect to fail is a failure of the test.
    onError: (error) => {
      throw error
    },
  })
  return { ...harness, doc, session }
}

const id = (name: string): ObjectId => asObjectId(`obj_${name}`)

function objects(store: { getDocument: () => { objects: ReadonlyMap<ObjectId, AnyOpenFrameObject> } }): Record<string, AnyOpenFrameObject> {
  return Object.fromEntries([...store.getDocument().objects])
}

/**
 * The assertion every test here ends with, and the reason it is a helper: it
 * checks BOTH agreements, and only one of them is obvious. The two clients
 * must agree with each other, and each must also agree with the `Y.Doc` it is
 * bound to — a client that quietly diverges from the CRDT looks perfectly
 * healthy until it reloads and its work is gone.
 */
function expectConverged(...peers: { doc: Y.Doc; store: { getDocument: () => { objects: ReadonlyMap<ObjectId, AnyOpenFrameObject> } } }[]): void {
  const [first] = peers
  if (first === undefined) throw new Error('nothing to compare')
  for (const client of peers) {
    expect(Object.fromEntries(objectsFromDoc(client.doc))).toEqual(objects(client.store))
    expect(objects(client.store)).toEqual(objects(first.store))
  }
}

let a: ReturnType<typeof peer>
let b: ReturnType<typeof peer>
let wire: Wire

beforeEach(() => {
  a = peer(0)
  b = peer(1000)
  wire = new Wire([a.doc, b.doc])
})

/** A sticky, created on `a` with a stated id so both clients can name it. */
function sticky(name: string, text: string, parentId: ObjectId | null = null): ObjectId {
  const result = a.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [{ id: id(name), type: 'sticky', x: 0, y: 0, parentId, data: { text: richFromPlain(text) } }],
  })
  if (!result.ok) throw result.error
  return id(name)
}

function frame(name: string, label: string): ObjectId {
  const result = a.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [{ id: id(name), type: 'frame', x: 0, y: 0, width: 400, height: 400, data: { name: label } }],
  })
  if (!result.ok) throw result.error
  return id(name)
}

describe('two clients on one board', () => {
  it('carries a local change to the other client', () => {
    const note = sticky('note', 'hello')

    expect(b.store.getObject(note)).toBeDefined()
    expectConverged(a, b)
  })

  it('does not send a merged change back where it came from', () => {
    let returned = 0
    a.doc.on('update', (_update: Uint8Array, origin: unknown) => {
      if (origin === WIRE) returned++
    })

    sticky('note', 'hello')

    expect(returned).toBe(0)
  })

  /**
   * That a client ignores its OWN writes coming back out of the `Y.Doc`.
   *
   * This test exists because the two guards in `CollabSession` were written
   * believing each was load-bearing, and they are not equally so. Deleting the
   * origin check in `#merge` entirely left all ten tests above passing: the
   * `#merging` flag still stops the echo being re-published, so nothing loops
   * and nothing diverges. A guard no test depends on is a guard that gets
   * deleted by the next person to tidy up — so here is what it actually buys.
   *
   * Without it every local edit is dispatched TWICE, the second time as a
   * phantom merge of the change you just made: double the work per keystroke,
   * and a second notification to every subscriber — autosave, persistence and
   * later the network — for one user action. Inverting the check instead (skip
   * everything except your own writes) fails seven of these tests, because then
   * nothing merges at all.
   */
  it('ignores its own writes coming back out of the document', () => {
    const merges: string[] = []
    a.dispatcher.subscribe((result) => {
      if (result.origin === 'remote') merges.push(result.label)
    })

    sticky('note', 'hello')
    a.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id: id('note'), dx: 5, dy: 5 }] })

    expect(merges).toEqual([])
  })

  /** Undo reverts YOUR change, not the most recent one. */
  it('keeps a merged change out of the receiver history', () => {
    sticky('note', 'hello')

    expect(a.dispatcher.undoStack.canUndo).toBe(true)
    expect(b.dispatcher.undoStack.canUndo).toBe(false)
  })

  /**
   * A remote restyle must not wake the structure subscribers. `isStructural` is
   * true for any patch that is not a `set`, so translating an update as a
   * whole-object `add` — the shorter implementation — would make one person
   * recolouring one note re-run culling and layout on every other person's
   * board. See `fieldPatches`.
   */
  it('does not treat a remote edit as a structural change', () => {
    const note = sticky('note', 'hello')
    let structural = 0
    let touched = 0
    b.store.subscribeToStructure(() => structural++)
    b.store.subscribeToObject(note, () => touched++)

    const restyled = a.dispatcher.dispatch({ kind: 'UpdateStyle', ids: [note], style: { color: 'blue' } })
    expect(restyled.ok).toBe(true)

    expect(touched).toBe(1)
    expect(structural).toBe(0)
    expect(b.store.getObject(note)?.style.color).toBe('blue')
  })

  it('converges after both clients edit while disconnected', () => {
    const one = sticky('one', 'one')
    const two = sticky('two', 'two')
    wire.disconnect()

    a.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id: one, dx: 30, dy: 40 }] })
    b.dispatcher.dispatch({ kind: 'UpdateStyle', ids: [two], style: { color: 'red' } })
    wire.reconnect()

    expect(a.store.getObject(one)?.frame.x).toBe(30)
    expect(a.store.getObject(two)?.style.color).toBe('red')
    expectConverged(a, b)
  })

  it('keeps both objects when two clients create at once', () => {
    wire.disconnect()
    const mine = a.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ type: 'sticky', x: 0, y: 0, data: { text: richFromPlain('mine') } }],
    })
    const yours = b.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ type: 'sticky', x: 100, y: 0, data: { text: richFromPlain('yours') } }],
    })
    wire.reconnect()

    expect(mine.ok && yours.ok).toBe(true)
    expect(a.store.getDocument().objects.size).toBe(2)
    expectConverged(a, b)
  })
})

describe('the corruption a merge can create', () => {
  /**
   * The one invariant last-writer-wins cannot protect, and the reason this
   * stage exists. Two people drag each frame into the other at the same
   * moment. Both succeed locally — neither client can see the other's drag —
   * and the merge keeps both writes, because they are writes to DIFFERENT
   * objects and nothing about them conflicts. The result is a loop that
   * belongs to neither of them.
   */
  it('breaks a concurrent reparent cycle, identically on both clients', () => {
    const outer = frame('outer', 'Outer')
    const inner = frame('inner', 'Inner')
    wire.disconnect()

    a.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [outer], parentId: inner })
    b.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [inner], parentId: outer })
    wire.reconnect()

    for (const client of [a, b]) {
      const map = client.store.getDocument().objects
      expect(findParentCycle(map, outer)).toBeNull()
      expect(findParentCycle(map, inner)).toBeNull()
      expect(map.size).toBe(2)
    }
    expectConverged(a, b)
  })

  /**
   * The repair has to land in the shared state, not only in each client's
   * memory. If it did not, the `Y.Doc` would keep the loop forever and hand it
   * to the next person who opens the board — every client repairing, none of
   * them recording it.
   */
  it('writes the repair back, so the next client inherits a sound board', () => {
    const outer = frame('outer', 'Outer')
    const inner = frame('inner', 'Inner')
    wire.disconnect()
    a.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [outer], parentId: inner })
    b.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [inner], parentId: outer })
    wire.reconnect()

    const late = peer(2000)
    new Wire([a.doc, late.doc])
    Y.applyUpdate(late.doc, Y.encodeStateAsUpdate(a.doc), WIRE)

    const map = late.store.getDocument().objects
    expect(map.size).toBe(2)
    expect(findParentCycle(map, outer)).toBeNull()
    expect(findParentCycle(map, inner)).toBeNull()
  })

  /**
   * The commoner corruption, and the one that reads as lost work: you delete a
   * frame at the moment somebody drops a note into it. Nothing conflicts — the
   * delete and the reparent touch different objects — and the note survives
   * pointing at a parent that is gone. Left alone it cannot be painted at all.
   */
  it('rescues a child whose frame was deleted from under it', () => {
    const board = frame('board', 'Ideas')
    const note = sticky('note', 'keep me')
    wire.disconnect()

    a.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [board] })
    b.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [note], parentId: board })
    wire.reconnect()

    for (const client of [a, b]) {
      expect(client.store.getObject(note)).toBeDefined()
      expect(client.store.getObject(note)?.parentId).toBeNull()
    }
    expectConverged(a, b)
  })

  /**
   * `applyPatches` throws on a `set` against an object that is not there, which
   * is right for a local command and wrong for a merge. Without the filter in
   * `applyRemotePatches` this race takes the sync loop down.
   */
  it('survives an edit racing a delete', () => {
    const note = sticky('note', 'hello')
    wire.disconnect()

    a.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [note] })
    b.dispatcher.dispatch({ kind: 'UpdateObjectData', id: note, patch: { text: richFromPlain('edited') } })

    expect(() => {
      wire.reconnect()
    }).not.toThrow()
    expectConverged(a, b)
  })
})
