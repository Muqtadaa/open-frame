import { beforeEach, describe, expect, it } from 'vitest'

import { childrenOf } from '../domain/document.js'
import type { ObjectId } from '../domain/ids.js'
import { createTestHarness, type TestHarness } from '../testing.js'

function create(h: TestHarness, type: string, x = 0, y = 0): ObjectId {
  const result = h.dispatcher.dispatch({ kind: 'CreateObjects', objects: [{ type, x, y }] })
  if (!result.ok) throw result.error
  const id = result.affected[0]
  if (id === undefined) throw new Error('expected an id')
  return id
}

function order(h: TestHarness): string[] {
  return childrenOf(h.store.getDocument(), null).map((o) => o.id)
}

describe('RotateObjects', () => {
  let h: TestHarness
  beforeEach(() => {
    h = createTestHarness()
  })

  it('rotates a type that allows it', () => {
    const id = create(h, 'shape')
    h.dispatcher.dispatch({ kind: 'RotateObjects', rotations: [{ id, rotation: Math.PI / 2 }] })
    expect(h.store.getObject(id)?.frame.rotation).toBeCloseTo(Math.PI / 2, 10)
  })

  /** The registry decides, not a switch on type: sticky notes do not rotate. */
  it('refuses a type that declares itself non-rotatable', () => {
    const id = create(h, 'sticky')
    const result = h.dispatcher.dispatch({
      kind: 'RotateObjects',
      rotations: [{ id, rotation: 1 }],
    })
    expect(result.ok).toBe(false)
    expect(h.store.getObject(id)?.frame.rotation).toBe(0)
  })

  it('normalises past a full turn so stored values stay comparable', () => {
    const id = create(h, 'shape')
    h.dispatcher.dispatch({
      kind: 'RotateObjects',
      rotations: [{ id, rotation: Math.PI * 2 + Math.PI / 4 }],
    })
    expect(h.store.getObject(id)?.frame.rotation).toBeCloseTo(Math.PI / 4, 10)
  })

  it('normalises negative rotation into range', () => {
    const id = create(h, 'shape')
    h.dispatcher.dispatch({ kind: 'RotateObjects', rotations: [{ id, rotation: -Math.PI / 2 }] })
    expect(h.store.getObject(id)?.frame.rotation).toBeCloseTo((Math.PI * 3) / 2, 10)
  })

  it('rejects a locked object', () => {
    const id = create(h, 'shape')
    h.dispatcher.dispatch({ kind: 'SetLocked', ids: [id], locked: true })
    expect(
      h.dispatcher.dispatch({ kind: 'RotateObjects', rotations: [{ id, rotation: 1 }] }).ok,
    ).toBe(false)
  })
})

describe('ReorderObjects', () => {
  let h: TestHarness
  let a: ObjectId
  let b: ObjectId
  let c: ObjectId

  beforeEach(() => {
    h = createTestHarness()
    a = create(h, 'sticky', 0, 0)
    b = create(h, 'sticky', 10, 0)
    c = create(h, 'sticky', 20, 0)
  })

  it('starts in creation order', () => {
    expect(order(h)).toEqual([a, b, c])
  })

  it('brings to front', () => {
    h.dispatcher.dispatch({ kind: 'ReorderObjects', ids: [a], placement: 'front' })
    expect(order(h)).toEqual([b, c, a])
  })

  it('sends to back', () => {
    h.dispatcher.dispatch({ kind: 'ReorderObjects', ids: [c], placement: 'back' })
    expect(order(h)).toEqual([c, a, b])
  })

  it('steps forward past exactly one neighbour', () => {
    h.dispatcher.dispatch({ kind: 'ReorderObjects', ids: [a], placement: 'forward' })
    expect(order(h)).toEqual([b, a, c])
  })

  it('steps backward past exactly one neighbour', () => {
    h.dispatcher.dispatch({ kind: 'ReorderObjects', ids: [c], placement: 'backward' })
    expect(order(h)).toEqual([a, c, b])
  })

  /**
   * Fractional indices are the reason this is cheap: moving to the front writes
   * ONE object, not every sibling.
   */
  it('writes only the objects that moved', () => {
    const result = h.dispatcher.dispatch({ kind: 'ReorderObjects', ids: [a], placement: 'front' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.affected).toEqual([a])
  })

  it('keeps a multi-selection in its relative order', () => {
    h.dispatcher.dispatch({ kind: 'ReorderObjects', ids: [a, b], placement: 'front' })
    expect(order(h)).toEqual([c, a, b])
  })

  it('is undoable as one action', () => {
    h.dispatcher.dispatch({ kind: 'ReorderObjects', ids: [a], placement: 'front' })
    h.dispatcher.undo()
    expect(order(h)).toEqual([a, b, c])
  })
})

describe('SetLocked and SetHidden', () => {
  let h: TestHarness
  beforeEach(() => {
    h = createTestHarness()
  })

  it('locks and blocks further mutation', () => {
    const id = create(h, 'sticky')
    h.dispatcher.dispatch({ kind: 'SetLocked', ids: [id], locked: true })
    expect(h.store.getObject(id)?.locked).toBe(true)
    expect(h.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id, dx: 5, dy: 5 }] }).ok).toBe(
      false,
    )
  })

  /** Unlocking must work ON a locked object, or locking is a one-way trap. */
  it('can unlock a locked object', () => {
    const id = create(h, 'sticky')
    h.dispatcher.dispatch({ kind: 'SetLocked', ids: [id], locked: true })
    const result = h.dispatcher.dispatch({ kind: 'SetLocked', ids: [id], locked: false })
    expect(result.ok).toBe(true)
    expect(h.store.getObject(id)?.locked).toBe(false)
  })

  it('hides and shows', () => {
    const id = create(h, 'sticky')
    h.dispatcher.dispatch({ kind: 'SetHidden', ids: [id], hidden: true })
    expect(h.store.getObject(id)?.hidden).toBe(true)
    h.dispatcher.dispatch({ kind: 'SetHidden', ids: [id], hidden: false })
    expect(h.store.getObject(id)?.hidden).toBe(false)
  })

  it('treats a no-op as success without a history entry', () => {
    const id = create(h, 'sticky')
    const depth = h.dispatcher.undoStack.depth
    const result = h.dispatcher.dispatch({ kind: 'SetLocked', ids: [id], locked: false })
    expect(result.ok).toBe(true)
    expect(h.dispatcher.undoStack.depth).toBe(depth)
  })
})
