import { describe, expect, it } from 'vitest'

import { asObjectId, type ObjectId } from '../domain/ids.js'
import type { Patch } from '../domain/patch.js'
import { richFromPlain } from '../domain/rich-text.js'
import type { BoardAction, Capabilities } from '../ports/capabilities.js'
import { createTestHarness } from '../testing.js'

/**
 * Undo and redo pass the same guards as any other change (tracks A-1).
 *
 * History was replayed as stored patches with no check at all, which was an
 * edge case between two people and is the NORMAL case with an agent on the
 * board: the agent deletes an object, the person presses Cmd+Z on an earlier
 * edit to it, and the undo threw `PatchError` out of the keyboard handler.
 * It also walked straight past locks, and past a role narrowed to viewer.
 */

const id = (name: string): ObjectId => asObjectId(`obj_${name}`)

function harness(capabilities?: Capabilities) {
  const h = createTestHarness(capabilities === undefined ? {} : { capabilities })
  const created = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: ['a', 'b'].map((name, index) => ({
      id: id(name),
      type: 'sticky',
      x: index * 100,
      y: 0,
      data: { text: richFromPlain(name) },
    })),
  })
  if (!created.ok) throw created.error
  return h
}

/** A change from somebody else — an agent, or another person — as the room delivers it. */
function remote(h: ReturnType<typeof harness>, patches: Patch[]): void {
  const result = h.dispatcher.dispatch(
    { kind: 'ApplyRemotePatches', patches },
    { origin: 'remote', skipUndo: true },
  )
  if (!result.ok) throw result.error
}

const x = (h: ReturnType<typeof harness>, name: string) => h.store.getObject(id(name))?.frame.x

describe('undo after somebody else changed the board', () => {
  it('does not throw when the object it would restore has been deleted', () => {
    const h = harness()
    h.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id: id('a'), dx: 50, dy: 0 }] })
    remote(h, [{ op: 'remove', id: id('a') }])

    let result: ReturnType<typeof h.dispatcher.undo> = null
    expect(() => {
      result = h.dispatcher.undo()
    }).not.toThrow()
    expect(result).toMatchObject({ ok: false, error: { code: 'stale-history' } })
    // Nothing came back, and nothing else moved.
    expect(h.store.getObject(id('a'))).toBeUndefined()
    expect(x(h, 'b')).toBe(100)
  })

  it('restores what is still there and leaves what is gone', () => {
    const h = harness()
    h.dispatcher.dispatch({
      kind: 'MoveObjects',
      moves: [
        { id: id('a'), dx: 50, dy: 0 },
        { id: id('b'), dx: 50, dy: 0 },
      ],
    })
    remote(h, [{ op: 'remove', id: id('a') }])

    const result = h.dispatcher.undo()
    expect(result?.ok).toBe(true)
    expect(x(h, 'b')).toBe(100)
    expect(h.store.getObject(id('a'))).toBeUndefined()
  })

  it('does not reach into an object somebody else has locked', () => {
    const h = harness()
    h.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id: id('a'), dx: 50, dy: 0 }] })
    remote(h, [{ op: 'set', id: id('a'), path: ['locked'], value: true }])

    const result = h.dispatcher.undo()
    expect(result).toMatchObject({ ok: false, error: { code: 'stale-history' } })
    expect(x(h, 'a')).toBe(50)
    expect(h.store.getObject(id('a'))?.locked).toBe(true)
  })

  it('still undoes its own Lock', () => {
    const h = harness()
    h.dispatcher.dispatch({ kind: 'SetLocked', ids: [id('a')], locked: true })
    const result = h.dispatcher.undo()
    expect(result?.ok).toBe(true)
    expect(h.store.getObject(id('a'))?.locked).toBe(false)
  })

  it('does not throw undoing a creation somebody else has already deleted', () => {
    const h = harness()
    remote(h, [
      { op: 'remove', id: id('a') },
      { op: 'remove', id: id('b') },
    ])
    expect(() => h.dispatcher.undo()).not.toThrow()
    expect(h.store.getDocument().objects.size).toBe(0)
  })

  it('does not throw on redo either', () => {
    const h = harness()
    h.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id: id('a'), dx: 50, dy: 0 }] })
    h.dispatcher.undo()
    remote(h, [{ op: 'remove', id: id('a') }])
    let result: ReturnType<typeof h.dispatcher.redo> = null
    expect(() => {
      result = h.dispatcher.redo()
    }).not.toThrow()
    expect(result).toMatchObject({ ok: false, error: { code: 'stale-history' } })
  })

  it('refuses to undo for somebody who may no longer edit, and keeps the step', () => {
    let allowed: readonly BoardAction[] = ['view', 'comment', 'edit']
    const h = harness({ can: (action) => allowed.includes(action) })
    h.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id: id('a'), dx: 50, dy: 0 }] })
    allowed = ['view', 'comment']

    const result = h.dispatcher.undo()
    expect(result).toMatchObject({ ok: false, error: { code: 'unauthorized' } })
    expect(x(h, 'a')).toBe(50)
    // The step is still there for when editing is allowed again.
    expect(h.dispatcher.undoStack.canUndo).toBe(true)
  })

  it('undoes as before when nobody else touched anything', () => {
    const h = harness()
    h.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id: id('a'), dx: 50, dy: 0 }] })
    expect(h.dispatcher.undo()?.ok).toBe(true)
    expect(x(h, 'a')).toBe(0)
    expect(h.dispatcher.redo()?.ok).toBe(true)
    expect(x(h, 'a')).toBe(50)
  })
})
