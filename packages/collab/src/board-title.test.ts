import { createSequentialIdGenerator } from '@openframe/core'
import { createTestHarness } from '@openframe/core/testing'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { CollabSession } from './session.js'

import { applyPatchesToDoc, metaOf, objectsOf, seedDoc } from './document-map.js'
import { metaPatchesFromEvent } from './remote-patches.js'

/**
 * A rename crossing between two peers.
 *
 * The board's title is the first piece of state in this system that is not an
 * object, so it travels on a channel the objects map never sees. Everything
 * here is about that channel actually existing — a translation that quietly
 * drops one direction looks exactly like a feature nobody uses.
 */

function docWith(title: string): Y.Doc {
  const doc = new Y.Doc()
  metaOf(doc).set('title', title)
  return doc
}

/** Applies one document's state onto another, as a room would. */
function sync(from: Y.Doc, to: Y.Doc): void {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from))
}

describe('a renamed board', () => {
  it('reaches the other peer', () => {
    const alice = docWith('Untitled board')
    const bob = new Y.Doc()
    sync(alice, bob)

    applyPatchesToDoc(alice, [{ op: 'meta', path: ['title'], value: 'Pricing research' }])
    sync(alice, bob)

    expect(metaOf(bob).get('title')).toBe('Pricing research')
  })

  it('comes back out as a patch the dispatcher understands', () => {
    const alice = docWith('Untitled board')
    const bob = new Y.Doc()
    sync(alice, bob)

    const seen: unknown[] = []
    metaOf(bob).observe((event) => {
      seen.push(...metaPatchesFromEvent(event))
    })

    applyPatchesToDoc(alice, [{ op: 'meta', path: ['title'], value: 'Pricing research' }])
    sync(alice, bob)

    expect(seen).toEqual([{ op: 'meta', path: ['title'], value: 'Pricing research' }])
  })

  /**
   * `undefined` is core's "no such field", and it is not storable in a `Y.Map`.
   * Both sides have to agree, or an inverse derived from a field that was never
   * there restores a literal `undefined` instead of removing the key.
   */
  it('carries a cleared field as a delete, and back as undefined', () => {
    const alice = docWith('Untitled board')
    const bob = new Y.Doc()
    sync(alice, bob)

    const seen: unknown[] = []
    metaOf(bob).observe((event) => {
      seen.push(...metaPatchesFromEvent(event))
    })

    applyPatchesToDoc(alice, [{ op: 'meta', path: ['title'], value: undefined }])
    sync(alice, bob)

    expect(metaOf(bob).has('title')).toBe(false)
    expect(seen).toEqual([{ op: 'meta', path: ['title'], value: undefined }])
  })

  /**
   * The channels are separate, and this is what says so. A rename that landed
   * in the objects map would be handed to the renderer as an object to draw.
   */
  it('never appears among the objects', () => {
    const alice = docWith('Untitled board')

    applyPatchesToDoc(alice, [{ op: 'meta', path: ['title'], value: 'Pricing research' }])

    expect([...objectsOf(alice).keys()]).toEqual([])
  })
})

describe('publishing a board into a room', () => {
  /**
   * Without this, a board shared after being renamed arrives in the second
   * browser called whatever an empty document is called — which reads exactly
   * like the rename having been lost.
   */
  it('takes its title with it', () => {
    const local = new Y.Doc()
    seedDoc(local, {
      id: 'brd_x' as never,
      objects: new Map(),
      assets: new Map(),
      meta: { title: 'Pricing research', createdAt: 0 },
    })

    const joiner = new Y.Doc()
    sync(local, joiner)

    expect(metaOf(joiner).get('title')).toBe('Pricing research')
  })
})

describe('two people renaming at once', () => {
  /**
   * Last write wins, and that is the right answer rather than a shortcut: one
   * of the two names was always going to lose, and the loser can see which one
   * won. What matters is that the two peers agree afterwards.
   */
  it('converges', () => {
    const alice = docWith('Untitled board')
    const bob = new Y.Doc()
    sync(alice, bob)

    applyPatchesToDoc(alice, [{ op: 'meta', path: ['title'], value: 'Alice board' }])
    applyPatchesToDoc(bob, [{ op: 'meta', path: ['title'], value: 'Bob board' }])
    sync(alice, bob)
    sync(bob, alice)

    expect(metaOf(alice).get('title')).toBe(metaOf(bob).get('title'))
  })
})

/**
 * The session's meta observer, which is the thing that makes any of the above
 * visible to a person.
 *
 * Written because removing `meta.observe` broke nothing: everything above
 * exercised the TRANSLATION, and none of it exercised the session's second
 * channel. A rename that reaches the CRDT and stops there leaves the title on
 * screen as it was when the tab opened, and only a reload reveals it.
 */
describe('a rename arriving at a live session', () => {
  const WIRE = 'test:wire'

  function pair() {
    const a = createTestHarness()
    const b = createTestHarness({ ids: createSequentialIdGenerator(500) })
    const docA = new Y.Doc()
    const docB = new Y.Doc()

    for (const [from, to] of [
      [docA, docB],
      [docB, docA],
    ] as const) {
      from.on('update', (update: Uint8Array, origin: unknown) => {
        if (origin === WIRE) return
        Y.applyUpdate(to, update, WIRE)
      })
    }

    const sessionA = CollabSession.join({
      doc: docA,
      dispatcher: a.dispatcher,
      onError: (error) => {
        throw error
      },
    })
    const sessionB = CollabSession.join({
      doc: docB,
      dispatcher: b.dispatcher,
      onError: (error) => {
        throw error
      },
    })
    return { a, b, sessionA, sessionB }
  }

  it('changes the title the other person is looking at', () => {
    const { a, b } = pair()

    const renamed = a.dispatcher.dispatch({ kind: 'SetBoardTitle', title: 'Pricing research' })

    expect(renamed.ok).toBe(true)
    expect(b.store.getDocument().meta.title).toBe('Pricing research')
  })

  it('does not put somebody else’s rename in your undo history', () => {
    const { a, b } = pair()
    const depth = b.dispatcher.undoStack.depth

    a.dispatcher.dispatch({ kind: 'SetBoardTitle', title: 'Pricing research' })

    expect(b.dispatcher.undoStack.depth).toBe(depth)
    // And undo on the renamer's side still takes back their own change.
    a.dispatcher.undo()
    expect(b.store.getDocument().meta.title).not.toBe('Pricing research')
  })

  it('does not echo the rename back as a second change', () => {
    const { a, b } = pair()
    let changes = 0
    a.dispatcher.subscribe(() => {
      changes += 1
    })

    b.dispatcher.dispatch({ kind: 'SetBoardTitle', title: 'Pricing research' })

    // One merge on A, and nothing bouncing back to B and round again.
    expect(changes).toBe(1)
    expect(a.store.getDocument().meta.title).toBe('Pricing research')
  })
})
