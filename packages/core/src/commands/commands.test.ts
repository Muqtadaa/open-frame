import { beforeEach, describe, expect, it } from 'vitest'

import { childrenOf } from '../domain/document.js'
import { asObjectId, type ObjectId } from '../domain/ids.js'
import { applyPatches } from '../domain/patch.js'
import { allowAllCapabilities, readOnlyCapabilities } from '../ports/capabilities.js'
import { richFromPlain } from '../domain/rich-text.js'
import { createTestHarness, type TestHarness } from '../testing.js'
import { CommandDispatcher } from './dispatcher.js'
import { createDocumentStore } from '../store/document-store.js'
import { createEmptyDocument } from '../domain/document.js'
import { asBoardId } from '../domain/ids.js'
import { fixedClock } from '../ports/clock.js'
import { createSequentialIdGenerator } from '../ports/id-generator.js'
import { createDefaultRegistry } from '../types/index.js'

/** Core compiles without the DOM library, so `structuredClone` is not available. */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function createSticky(h: TestHarness, x = 0, y = 0, text = ''): ObjectId {
  const result = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [{ type: 'sticky', x, y, data: { text: richFromPlain(text) } }],
  })
  if (!result.ok) throw result.error
  const id = result.affected[0]
  if (id === undefined) throw new Error('expected a created object')
  return id
}

describe('command dispatch', () => {
  let h: TestHarness
  beforeEach(() => {
    h = createTestHarness()
  })

  describe('CreateObjects', () => {
    it('creates an object with type defaults', () => {
      const id = createSticky(h, 10, 20)
      const object = h.store.getObject(id)
      expect(object?.type).toBe('sticky')
      expect(object?.frame).toEqual({ x: 10, y: 20, width: 180, height: 180, rotation: 0 })
      // One empty span, never an empty list — the two would be two spellings
      // of "no text" and every consumer would have to handle both (ADR 0012).
      expect(object?.data).toEqual({ text: [{ text: '' }] })
    })

    it('records the origin that created it', () => {
      const result = h.dispatcher.dispatch(
        { kind: 'CreateObjects', objects: [{ type: 'sticky', x: 0, y: 0 }] },
        { origin: 'ai' },
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(h.store.getObject(result.affected[0]!)?.meta.createdVia).toBe('ai')
    })

    it('gives objects created together distinct, increasing order keys', () => {
      const result = h.dispatcher.dispatch({
        kind: 'CreateObjects',
        objects: [
          { type: 'sticky', x: 0, y: 0 },
          { type: 'sticky', x: 10, y: 0 },
          { type: 'sticky', x: 20, y: 0 },
        ],
      })
      expect(result.ok).toBe(true)
      const orders = childrenOf(h.store.getDocument(), null).map((o) => o.order)
      expect(new Set(orders).size).toBe(3)
      expect([...orders].sort()).toEqual(orders)
    })

    it('rejects an unregistered type', () => {
      const result = h.dispatcher.dispatch({
        kind: 'CreateObjects',
        objects: [{ type: 'not_a_real_type', x: 0, y: 0 }],
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('unknown-type')
      expect(h.store.getDocument().objects.size).toBe(0)
    })

    it('rejects a non-finite position without touching the document', () => {
      const result = h.dispatcher.dispatch({
        kind: 'CreateObjects',
        objects: [{ type: 'sticky', x: Number.NaN, y: 0 }],
      })
      expect(result.ok).toBe(false)
      expect(h.store.getDocument().objects.size).toBe(0)
    })
  })

  describe('DeleteObjects', () => {
    it('deletes an object', () => {
      const id = createSticky(h)
      h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [id] })
      expect(h.store.getObject(id)).toBeUndefined()
    })

    it('rejects deleting a locked object', () => {
      const id = createSticky(h)
      h.writer.applyPatches([{ op: 'set', id, path: ['locked'], value: true }])
      const result = h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [id] })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('object-locked')
      expect(h.store.getObject(id)).toBeDefined()
    })

    it('rejects deleting an object that does not exist', () => {
      const result = h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [asObjectId('ghost')] })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('unknown-object')
    })

    it('cascades to descendants so children are never orphaned', () => {
      const parent = createSticky(h)
      const child = createSticky(h)
      h.writer.applyPatches([{ op: 'set', id: child, path: ['parentId'], value: parent }])

      const result = h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [parent] })
      expect(result.ok).toBe(true)
      expect(h.store.getObject(child)).toBeUndefined()
      expect(h.store.getDocument().objects.size).toBe(0)
    })
  })

  describe('MoveObjects', () => {
    it('moves several objects in one action', () => {
      const a = createSticky(h, 0, 0)
      const b = createSticky(h, 100, 0)
      h.dispatcher.dispatch({
        kind: 'MoveObjects',
        moves: [
          { id: a, dx: 10, dy: 5 },
          { id: b, dx: -20, dy: 0 },
        ],
      })
      expect(h.store.getObject(a)?.frame.x).toBe(10)
      expect(h.store.getObject(b)?.frame.x).toBe(80)
    })

    it('treats a zero-distance move as a successful no-op with no history', () => {
      const id = createSticky(h)
      const before = h.dispatcher.undoStack.depth
      const result = h.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id, dx: 0, dy: 0 }] })
      expect(result.ok).toBe(true)
      expect(h.dispatcher.undoStack.depth).toBe(before)
    })

    it('rejects a move of a locked object', () => {
      const id = createSticky(h)
      h.writer.applyPatches([{ op: 'set', id, path: ['locked'], value: true }])
      const result = h.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id, dx: 1, dy: 1 }] })
      expect(result.ok).toBe(false)
    })
  })

  describe('UpdateObjectData', () => {
    it('merges a partial payload', () => {
      const id = createSticky(h, 0, 0, 'before')
      h.dispatcher.dispatch({
        kind: 'UpdateObjectData',
        id,
        patch: { text: richFromPlain('after') },
      })
      expect(h.store.getObject(id)?.data).toEqual({ text: richFromPlain('after') })
    })

    it('rejects a payload the type schema refuses', () => {
      const id = createSticky(h)
      const result = h.dispatcher.dispatch({
        kind: 'UpdateObjectData',
        id,
        // A plain string is no longer valid text, which is the point of the
        // boundary: an AI or an importer sending the old shape is rejected
        // rather than silently written.
        patch: { text: 'a plain string' },
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('invalid-data')
      expect(h.store.getObject(id)?.data).toEqual({ text: [{ text: '' }] })
    })
  })

  describe('UpdateStyle', () => {
    it('applies a supported style token', () => {
      const id = createSticky(h)
      h.dispatcher.dispatch({ kind: 'UpdateStyle', ids: [id], style: { color: 'yellow' } })
      expect(h.store.getObject(id)?.style.color).toBe('yellow')
    })

    /**
     * The anti-`switch(type)` guarantee in action: an `unknown` object declares
     * no style properties, so the same command that styles a sticky silently
     * skips it — without this handler knowing either type exists.
     */
    it('skips properties a type does not declare, rather than failing', () => {
      const sticky = createSticky(h)
      const quarantined = h.dispatcher.dispatch({
        kind: 'CreateObjects',
        objects: [{ type: 'unknown', x: 0, y: 0, data: { originalType: 'x', originalVersion: 1 } }],
      })
      expect(quarantined.ok).toBe(true)
      if (!quarantined.ok) return
      const unknownId = quarantined.affected[0]!

      const result = h.dispatcher.dispatch({
        kind: 'UpdateStyle',
        ids: [sticky, unknownId],
        style: { color: 'blue' },
      })
      expect(result.ok).toBe(true)
      expect(h.store.getObject(sticky)?.style.color).toBe('blue')
      expect(h.store.getObject(unknownId)?.style.color).toBeUndefined()
    })
  })

  describe('authorization', () => {
    it('refuses every command when the actor cannot edit', () => {
      const { store, writer } = createDocumentStore(createEmptyDocument(asBoardId('b'), 'b', 0))
      const dispatcher = new CommandDispatcher({
        store,
        writer,
        registry: createDefaultRegistry(),
        clock: fixedClock(0),
        ids: createSequentialIdGenerator(),
        capabilities: readOnlyCapabilities(),
      })
      const result = dispatcher.dispatch({
        kind: 'CreateObjects',
        objects: [{ type: 'sticky', x: 0, y: 0 }],
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('unauthorized')
      expect(store.getDocument().objects.size).toBe(0)
    })

    it('permits commands when the actor can edit', () => {
      expect(allowAllCapabilities.can('edit', asBoardId('b'))).toBe(true)
    })
  })
})

describe('undo and redo', () => {
  let h: TestHarness
  beforeEach(() => {
    h = createTestHarness()
  })

  it('records exactly one entry per dispatch, whatever the object count', () => {
    h.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [
        { type: 'sticky', x: 0, y: 0 },
        { type: 'sticky', x: 10, y: 0 },
        { type: 'sticky', x: 20, y: 0 },
      ],
    })
    expect(h.dispatcher.undoStack.depth).toBe(1)
    expect(h.dispatcher.undoStack.undoLabel).toBe('Create 3 objects')
  })

  it('restores the document exactly after undo', () => {
    const a = createSticky(h, 0, 0)
    const b = createSticky(h, 100, 0)
    const before = deepClone([...h.store.getDocument().objects.entries()])

    h.dispatcher.dispatch({
      kind: 'MoveObjects',
      moves: [
        { id: a, dx: 33, dy: 44 },
        { id: b, dx: -5, dy: 12 },
      ],
    })
    h.dispatcher.undo()

    expect([...h.store.getDocument().objects.entries()]).toEqual(before)
  })

  it('redoes what it undid', () => {
    const id = createSticky(h, 0, 0)
    h.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id, dx: 50, dy: 0 }] })
    h.dispatcher.undo()
    expect(h.store.getObject(id)?.frame.x).toBe(0)
    h.dispatcher.redo()
    expect(h.store.getObject(id)?.frame.x).toBe(50)
  })

  it('restores a deleted object with all of its data', () => {
    const id = createSticky(h, 7, 8, 'precious')
    const original = h.store.getObject(id)
    h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [id] })
    expect(h.store.getObject(id)).toBeUndefined()
    h.dispatcher.undo()
    expect(h.store.getObject(id)).toEqual(original)
  })

  it('discards redo history once a new action is taken', () => {
    const id = createSticky(h)
    h.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id, dx: 10, dy: 0 }] })
    h.dispatcher.undo()
    expect(h.dispatcher.undoStack.canRedo).toBe(true)
    h.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id, dx: 99, dy: 0 }] })
    expect(h.dispatcher.undoStack.canRedo).toBe(false)
  })

  it('returns null when there is nothing to undo', () => {
    expect(h.dispatcher.undo()).toBeNull()
    expect(h.dispatcher.redo()).toBeNull()
  })

  it('keeps remote-origin changes out of local history', () => {
    const id = createSticky(h)
    const depth = h.dispatcher.undoStack.depth
    h.dispatcher.dispatch(
      { kind: 'MoveObjects', moves: [{ id, dx: 10, dy: 10 }] },
      { origin: 'remote', skipUndo: true },
    )
    expect(h.store.getObject(id)?.frame.x).toBe(10)
    expect(h.dispatcher.undoStack.depth).toBe(depth)
  })
})

describe('transactions', () => {
  it('collapses several commands into one undoable action', () => {
    const h = createTestHarness()
    const result = h.dispatcher.transact('Add a pair', [
      { kind: 'CreateObjects', objects: [{ type: 'sticky', x: 0, y: 0 }] },
      { kind: 'CreateObjects', objects: [{ type: 'sticky', x: 200, y: 0 }] },
    ])
    expect(result.ok).toBe(true)
    expect(h.store.getDocument().objects.size).toBe(2)
    expect(h.dispatcher.undoStack.depth).toBe(1)

    h.dispatcher.undo()
    expect(h.store.getDocument().objects.size).toBe(0)
  })

  it('applies nothing when a later command in the transaction fails', () => {
    const h = createTestHarness()
    const result = h.dispatcher.transact('Mixed', [
      { kind: 'CreateObjects', objects: [{ type: 'sticky', x: 0, y: 0 }] },
      { kind: 'DeleteObjects', ids: [asObjectId('ghost')] },
    ])
    expect(result.ok).toBe(false)
    expect(h.store.getDocument().objects.size).toBe(0)
  })

  it('lets later commands in a transaction see earlier ones', () => {
    const h = createTestHarness()
    const created = h.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ type: 'sticky', x: 0, y: 0 }],
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const id = created.affected[0]!

    const result = h.dispatcher.transact('Move then delete', [
      { kind: 'MoveObjects', moves: [{ id, dx: 10, dy: 0 }] },
      { kind: 'DeleteObjects', ids: [id] },
    ])
    expect(result.ok).toBe(true)
    expect(h.store.getDocument().objects.size).toBe(0)
  })
})

describe('change notification', () => {
  it('notifies subscribers with the patches that caused the change', () => {
    const h = createTestHarness()
    const seen: number[] = []
    h.dispatcher.subscribe((result) => seen.push(result.patches.length))
    createSticky(h)
    expect(seen).toEqual([1])
  })

  it('applies patches to a document without mutating the previous one', () => {
    const h = createTestHarness()
    const id = createSticky(h)
    const before = h.store.getDocument()
    const after = applyPatches(before, [{ op: 'set', id, path: ['frame', 'x'], value: 1 }])
    expect(before.objects.get(id)?.frame.x).toBe(0)
    expect(after.objects.get(id)?.frame.x).toBe(1)
  })
})
