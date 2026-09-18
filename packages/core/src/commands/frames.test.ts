import { beforeEach, describe, expect, it } from 'vitest'

import { childrenOf } from '../domain/document.js'
import { findParentCycle } from '../domain/invariants.js'
import type { ObjectId } from '../domain/ids.js'
import { createTestHarness, type TestHarness } from '../testing.js'

function create(h: TestHarness, type: string, x = 0, y = 0): ObjectId {
  const result = h.dispatcher.dispatch({ kind: 'CreateObjects', objects: [{ type, x, y }] })
  if (!result.ok) throw result.error
  const id = result.affected[0]
  if (id === undefined) throw new Error('expected an id')
  return id
}

describe('ReparentObjects', () => {
  let h: TestHarness
  let frame: ObjectId
  let note: ObjectId

  beforeEach(() => {
    h = createTestHarness()
    frame = create(h, 'frame', 0, 0)
    note = create(h, 'sticky', 50, 50)
  })

  it('puts an object into a frame', () => {
    const result = h.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [note], parentId: frame })
    expect(result.ok).toBe(true)
    expect(h.store.getObject(note)?.parentId).toBe(frame)
    expect(childrenOf(h.store.getDocument(), frame).map((o) => o.id)).toEqual([note])
  })

  it('takes an object back out', () => {
    h.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [note], parentId: frame })
    h.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [note], parentId: null })
    expect(h.store.getObject(note)?.parentId).toBeNull()
  })

  /** Coordinates are absolute, so membership changes and geometry does not. */
  it('does not move the object it reparents', () => {
    const before = h.store.getObject(note)?.frame
    h.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [note], parentId: frame })
    expect(h.store.getObject(note)?.frame).toEqual(before)
  })

  it('refuses a parent that cannot have children', () => {
    const other = create(h, 'sticky', 400, 400)
    const result = h.dispatcher.dispatch({
      kind: 'ReparentObjects',
      ids: [note],
      parentId: other,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('invalid-input')
  })

  /**
   * The cycle guard, built in Phase 1 with no caller until frames existed.
   * A frame inside its own contents makes both unreachable.
   */
  it('refuses to put a frame inside itself', () => {
    const result = h.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [frame], parentId: frame })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('would-create-cycle')
  })

  it('refuses to put a frame inside its own descendant', () => {
    const inner = create(h, 'frame', 20, 20)
    h.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [inner], parentId: frame })

    const result = h.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [frame], parentId: inner })
    expect(result.ok).toBe(false)
    expect(findParentCycle(h.store.getDocument().objects, frame)).toBeNull()
  })

  it('allows nesting a frame inside another', () => {
    const inner = create(h, 'frame', 20, 20)
    const result = h.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [inner], parentId: frame })
    expect(result.ok).toBe(true)
    expect(h.store.getObject(inner)?.parentId).toBe(frame)
  })

  it('treats reparenting to the current parent as a no-op', () => {
    h.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [note], parentId: frame })
    const depth = h.dispatcher.undoStack.depth
    const result = h.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [note], parentId: frame })
    expect(result.ok).toBe(true)
    expect(h.dispatcher.undoStack.depth).toBe(depth)
  })

  it('is undoable', () => {
    h.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [note], parentId: frame })
    h.dispatcher.undo()
    expect(h.store.getObject(note)?.parentId).toBeNull()
  })
})

describe('moving a frame carries its contents', () => {
  let h: TestHarness
  let frame: ObjectId
  let note: ObjectId

  beforeEach(() => {
    h = createTestHarness()
    frame = create(h, 'frame', 0, 0)
    note = create(h, 'sticky', 50, 50)
    h.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [note], parentId: frame })
  })

  it('moves children by the same delta', () => {
    h.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id: frame, dx: 100, dy: 40 }] })
    expect(h.store.getObject(frame)?.frame.x).toBe(100)
    expect(h.store.getObject(note)?.frame.x).toBe(150)
    expect(h.store.getObject(note)?.frame.y).toBe(90)
  })

  it('cascades through nested frames', () => {
    const inner = create(h, 'frame', 10, 10)
    const deep = create(h, 'sticky', 20, 20)
    h.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [inner], parentId: frame })
    h.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [deep], parentId: inner })

    h.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id: frame, dx: 5, dy: 5 }] })
    expect(h.store.getObject(deep)?.frame.x).toBe(25)
  })

  /** Selecting a frame AND its child must not apply the delta to the child twice. */
  it('applies an explicit move once, not twice', () => {
    h.dispatcher.dispatch({
      kind: 'MoveObjects',
      moves: [
        { id: frame, dx: 100, dy: 0 },
        { id: note, dx: 100, dy: 0 },
      ],
    })
    expect(h.store.getObject(note)?.frame.x).toBe(150)
  })

  it('carries a locked child, which the lock does not prevent', () => {
    h.dispatcher.dispatch({ kind: 'SetLocked', ids: [note], locked: true })
    const result = h.dispatcher.dispatch({
      kind: 'MoveObjects',
      moves: [{ id: frame, dx: 30, dy: 0 }],
    })
    expect(result.ok).toBe(true)
    expect(h.store.getObject(note)?.frame.x).toBe(80)
  })

  it('is one undoable action however many children move', () => {
    h.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id: frame, dx: 100, dy: 40 }] })
    expect(h.dispatcher.undoStack.depth).toBe(1 + 3) // create x3 + move
    h.dispatcher.undo()
    expect(h.store.getObject(note)?.frame.x).toBe(50)
    expect(h.store.getObject(frame)?.frame.x).toBe(0)
  })

  it('deletes contents with the frame, and restores them together', () => {
    h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [frame] })
    expect(h.store.getDocument().objects.size).toBe(0)
    h.dispatcher.undo()
    expect(h.store.getObject(note)?.parentId).toBe(frame)
  })
})
