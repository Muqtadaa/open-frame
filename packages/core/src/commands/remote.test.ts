import { describe, expect, it } from 'vitest'

import { asObjectId, type ObjectId } from '../domain/ids.js'
import { findParentCycle, parentageRepairs } from '../domain/invariants.js'
import type { Patch } from '../domain/patch.js'
import { richFromPlain } from '../domain/rich-text.js'
import { createTestHarness } from '../testing.js'

/**
 * The two commands the merge path adds, tested without a CRDT in sight.
 *
 * Both exist so that a change arriving from another person still goes through
 * the one mutation path. Neither is reachable from the UI.
 */

const id = (name: string): ObjectId => asObjectId(`obj_${name}`)

function harnessWith(...notes: string[]): ReturnType<typeof createTestHarness> {
  const h = createTestHarness()
  const result = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: notes.map((name, index) => ({
      id: id(name),
      type: 'sticky',
      x: index * 100,
      y: 0,
      data: { text: richFromPlain(name) },
    })),
  })
  if (!result.ok) throw result.error
  return h
}

describe('ApplyRemotePatches', () => {
  /**
   * The command carries patches rather than intent, which would be a hole in
   * the command layer if anything could reach it. `origin` is what closes it:
   * a component holding a dispatcher cannot summon `remote` by accident, and
   * the default is `user`.
   */
  it('refuses a caller that is not the collaboration adapter', () => {
    const h = harnessWith('one')
    const result = h.dispatcher.dispatch({
      kind: 'ApplyRemotePatches',
      patches: [{ op: 'remove', id: id('one') }],
    })

    expect(result.ok).toBe(false)
    expect(h.store.getObject(id('one'))).toBeDefined()
  })

  it('applies patches that arrive with a remote origin', () => {
    const h = harnessWith('one')
    const depth = h.dispatcher.undoStack.depth
    const result = h.dispatcher.dispatch(
      { kind: 'ApplyRemotePatches', patches: [{ op: 'set', id: id('one'), path: ['frame', 'x'], value: 42 }] },
      { origin: 'remote', skipUndo: true },
    )

    expect(result.ok).toBe(true)
    expect(h.store.getObject(id('one'))?.frame.x).toBe(42)
    // Undo reverts YOUR change, not the most recent one.
    expect(h.dispatcher.undoStack.depth).toBe(depth)
  })

  /**
   * "Someone deleted it while your edit was in flight" is an ordinary merge
   * outcome, not a fault. `applyPatches` throws on both of these, which is
   * right for a local command — the handler validated against a document that
   * contained the object — and would take the sync loop down here.
   */
  it('drops a write to an object that is no longer there', () => {
    const h = harnessWith('one')
    const patches: Patch[] = [
      { op: 'set', id: id('ghost'), path: ['frame', 'x'], value: 1 },
      { op: 'remove', id: id('ghost') },
      { op: 'set', id: id('one'), path: ['frame', 'x'], value: 7 },
    ]
    const result = h.dispatcher.dispatch(
      { kind: 'ApplyRemotePatches', patches },
      { origin: 'remote', skipUndo: true },
    )

    expect(result.ok).toBe(true)
    expect(h.store.getObject(id('one'))?.frame.x).toBe(7)
  })

  /** A batch judges itself: a `set` on an object the same batch added applies. */
  it('sees what earlier patches in the same batch did', () => {
    const h = harnessWith('one')
    const object = h.store.getObject(id('one'))
    if (object === undefined) throw new Error('missing')

    const result = h.dispatcher.dispatch(
      {
        kind: 'ApplyRemotePatches',
        patches: [
          { op: 'add', id: id('new'), object: { ...object, id: id('new') } },
          { op: 'set', id: id('new'), path: ['frame', 'x'], value: 9 },
          { op: 'remove', id: id('one') },
          { op: 'set', id: id('one'), path: ['frame', 'x'], value: 9 },
        ],
      },
      { origin: 'remote', skipUndo: true },
    )

    expect(result.ok).toBe(true)
    expect(h.store.getObject(id('new'))?.frame.x).toBe(9)
    expect(h.store.getObject(id('one'))).toBeUndefined()
  })
})

describe('RepairParentage', () => {
  function cycle(): ReturnType<typeof createTestHarness> {
    const h = harnessWith('aaa', 'zzz')
    // Written straight in, because the command layer refuses to create one —
    // which is the point: a cycle only ever arrives through a merge.
    h.writer.applyPatches([
      { op: 'set', id: id('aaa'), path: ['parentId'], value: id('zzz') },
      { op: 'set', id: id('zzz'), path: ['parentId'], value: id('aaa') },
    ])
    return h
  }

  it('breaks a cycle, naming the same object whichever end it is asked about', () => {
    const fromOne = cycle()
    const fromOther = cycle()

    fromOne.dispatcher.dispatch({ kind: 'RepairParentage', ids: [id('aaa')] }, { origin: 'remote', skipUndo: true })
    fromOther.dispatcher.dispatch({ kind: 'RepairParentage', ids: [id('zzz')] }, { origin: 'remote', skipUndo: true })

    for (const h of [fromOne, fromOther]) {
      expect(findParentCycle(h.store.getDocument().objects, id('aaa'))).toBeNull()
      expect(findParentCycle(h.store.getDocument().objects, id('zzz'))).toBeNull()
    }
    expect(fromOne.store.getObject(id('aaa'))?.parentId).toEqual(
      fromOther.store.getObject(id('aaa'))?.parentId,
    )
  })

  /**
   * A repair that can be refused is not a repair. `ReparentObjects` rejects a
   * locked object, and reusing it here would make a cycle between two locked
   * frames permanent — with everything inside it unreachable.
   */
  it('repairs a locked object, which a reparent would refuse', () => {
    const h = cycle()
    h.writer.applyPatches([
      { op: 'set', id: id('aaa'), path: ['locked'], value: true },
      { op: 'set', id: id('zzz'), path: ['locked'], value: true },
    ])

    const refused = h.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [id('aaa')], parentId: null })
    expect(refused.ok).toBe(false)

    const repaired = h.dispatcher.dispatch(
      { kind: 'RepairParentage', ids: [id('aaa')] },
      { origin: 'remote', skipUndo: true },
    )
    expect(repaired.ok).toBe(true)
    expect(findParentCycle(h.store.getDocument().objects, id('aaa'))).toBeNull()
  })

  /** An id that is gone is read as a former parent; its orphans are checked instead. */
  it('rescues the orphans of a parent that no longer exists', () => {
    const h = harnessWith('note')
    h.writer.applyPatches([{ op: 'set', id: id('note'), path: ['parentId'], value: id('gone') }])

    const result = h.dispatcher.dispatch(
      { kind: 'RepairParentage', ids: [id('gone')] },
      { origin: 'remote', skipUndo: true },
    )

    expect(result.ok).toBe(true)
    expect(h.store.getObject(id('note'))?.parentId).toBeNull()
  })

  it('writes nothing when the parentage is sound', () => {
    const h = harnessWith('one', 'two')
    const result = h.dispatcher.dispatch(
      { kind: 'RepairParentage', ids: [id('one'), id('two')] },
      { origin: 'remote', skipUndo: true },
    )

    expect(result.ok && result.patches).toEqual([])
  })
})

describe('parentageRepairs', () => {
  /**
   * The load-time repair and the merge-time repair are the same decision made
   * by different machines at different moments. If asking about a subset gave
   * a different answer from asking about everything, two clients would repair
   * one corruption two ways and diverge for good.
   */
  it('detaches the same object whether asked about one member or all of them', () => {
    const h = harnessWith('aaa', 'mmm', 'zzz')
    h.writer.applyPatches([
      { op: 'set', id: id('aaa'), path: ['parentId'], value: id('zzz') },
      { op: 'set', id: id('zzz'), path: ['parentId'], value: id('aaa') },
    ])
    const objects = h.store.getDocument().objects

    const all = parentageRepairs(objects, [...objects.keys()])
    const one = parentageRepairs(objects, [id('zzz')])

    expect(one).toHaveLength(1)
    expect(one[0]?.objectId).toBe(all.find((r) => r.kind === 'detached-cycle')?.objectId)
  })

  /** One detachment per loop, however many of its members were asked about. */
  it('does not detach twice when both ends of a cycle are candidates', () => {
    const h = harnessWith('aaa', 'zzz')
    h.writer.applyPatches([
      { op: 'set', id: id('aaa'), path: ['parentId'], value: id('zzz') },
      { op: 'set', id: id('zzz'), path: ['parentId'], value: id('aaa') },
    ])

    const repairs = parentageRepairs(h.store.getDocument().objects, [id('aaa'), id('zzz')])
    expect(repairs).toHaveLength(1)
  })

  it('leaves a sound hierarchy alone', () => {
    const h = harnessWith('parent', 'child')
    h.writer.applyPatches([{ op: 'set', id: id('child'), path: ['parentId'], value: id('parent') }])

    expect(parentageRepairs(h.store.getDocument().objects, [id('child')])).toEqual([])
  })
})
