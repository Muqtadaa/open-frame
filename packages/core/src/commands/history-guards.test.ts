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

  /*
   * A newer edit to the same property wins (Codex, on #12). Undo replayed the
   * stored value regardless: I move a note to 50, somebody moves it to 100,
   * and my undo put it back at 0 — over their edit, silently.
   */
  it('does not overwrite a newer edit to the same property', () => {
    const h = harness()
    h.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id: id('a'), dx: 50, dy: 0 }] })
    remote(h, [
      {
        op: 'set',
        id: id('a'),
        path: ['frame'],
        value: { ...h.store.getObject(id('a'))?.frame, x: 100 },
      },
    ])

    const result = h.dispatcher.undo()
    expect(result).toMatchObject({ ok: false, error: { code: 'stale-history' } })
    expect(x(h, 'a')).toBe(100)
  })

  it('still undoes when somebody changed a DIFFERENT property of the object', () => {
    const h = harness()
    h.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id: id('a'), dx: 50, dy: 0 }] })
    remote(h, [{ op: 'set', id: id('a'), path: ['style', 'color'], value: 'blue' }])

    expect(h.dispatcher.undo()?.ok).toBe(true)
    expect(x(h, 'a')).toBe(0)
    expect(h.store.getObject(id('a'))?.style.color).toBe('blue')
  })

  it('does not redo over a newer edit either', () => {
    const h = harness()
    h.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id: id('a'), dx: 50, dy: 0 }] })
    h.dispatcher.undo()
    remote(h, [
      {
        op: 'set',
        id: id('a'),
        path: ['frame'],
        value: { ...h.store.getObject(id('a'))?.frame, x: 300 },
      },
    ])

    expect(h.dispatcher.redo()).toMatchObject({ ok: false, error: { code: 'stale-history' } })
    expect(x(h, 'a')).toBe(300)
  })

  /*
   * A lock the step was RECORDED with is not somebody else's (Codex, on #12).
   * Deleting an unlocked frame takes its locked child with it; undo brings
   * both back; redo must take both again, or the child is left pointing at a
   * parent that is gone.
   */
  it('redoes a cascade that took a locked child with it', () => {
    const h = harness()
    const frame = h.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ id: id('f'), type: 'frame', x: 0, y: 0 }],
    })
    if (!frame.ok) throw frame.error
    const child = h.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ id: id('c'), type: 'sticky', x: 10, y: 10, parentId: id('f') }],
    })
    if (!child.ok) throw child.error
    h.dispatcher.dispatch({ kind: 'SetLocked', ids: [id('c')], locked: true })

    const deleted = h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [id('f')] })
    expect(deleted.ok).toBe(true)
    expect(h.store.getObject(id('c'))).toBeUndefined()

    expect(h.dispatcher.undo()?.ok).toBe(true)
    expect(h.store.getObject(id('c'))?.locked).toBe(true)

    expect(h.dispatcher.redo()?.ok).toBe(true)
    expect(h.store.getObject(id('f'))).toBeUndefined()
    expect(h.store.getObject(id('c'))).toBeUndefined()
  })

  /*
   * A step's changes to ONE object go back together or not at all (Codex, on
   * #13). A conversion writes the type, its data version and the data it now
   * holds; filtering them one by one put back `sticky` over evidence data the
   * moment somebody had edited that data since.
   */
  it('does not half-undo a conversion somebody has edited since', () => {
    const h = harness()
    const converted = h.dispatcher.dispatch({
      kind: 'ConvertObjects',
      ids: [id('a')],
      toType: 'evidence',
    })
    expect(converted.ok).toBe(true)
    const data = h.store.getObject(id('a'))?.data as Record<string, unknown>
    remote(h, [{ op: 'set', id: id('a'), path: ['data'], value: { ...data, source: 'P07' } }])

    expect(h.dispatcher.undo()).toMatchObject({ ok: false, error: { code: 'stale-history' } })
    const after = h.store.getObject(id('a'))
    expect(after?.type).toBe('evidence')
    expect((after?.data as Record<string, unknown>).source).toBe('P07')
  })

  /*
   * Compared as the replay reaches each change, not against the board it
   * started from (Codex, on #13): a transaction that moved a note and then
   * deleted it comes back where it was BEFORE the move.
   */
  it('undoes a move-then-delete to where the note started', () => {
    const h = harness()
    const result = h.dispatcher.transact('Move and delete', [
      { kind: 'MoveObjects', moves: [{ id: id('a'), dx: 50, dy: 0 }] },
      { kind: 'DeleteObjects', ids: [id('a')] },
    ])
    expect(result.ok).toBe(true)
    expect(h.dispatcher.undo()?.ok).toBe(true)
    expect(x(h, 'a')).toBe(0)
  })

  it('undoes two moves of the same note in one step back to the start', () => {
    const h = harness()
    h.dispatcher.transact('Two moves', [
      { kind: 'MoveObjects', moves: [{ id: id('a'), dx: 50, dy: 0 }] },
      { kind: 'MoveObjects', moves: [{ id: id('a'), dx: 30, dy: 0 }] },
    ])
    expect(h.dispatcher.undo()?.ok).toBe(true)
    expect(x(h, 'a')).toBe(0)
    expect(h.dispatcher.redo()?.ok).toBe(true)
    expect(x(h, 'a')).toBe(80)
  })

  it('redoes a create-then-move to where the note was moved', () => {
    const h = harness()
    h.dispatcher.transact('Create and move', [
      { kind: 'CreateObjects', objects: [{ id: id('n'), type: 'sticky', x: 0, y: 300 }] },
      { kind: 'MoveObjects', moves: [{ id: id('n'), dx: 70, dy: 0 }] },
    ])
    expect(h.dispatcher.undo()?.ok).toBe(true)
    expect(h.store.getObject(id('n'))).toBeUndefined()
    expect(h.dispatcher.redo()?.ok).toBe(true)
    expect(x(h, 'n')).toBe(70)
  })
})
