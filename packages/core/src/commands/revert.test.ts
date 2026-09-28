import { describe, expect, it } from 'vitest'

import { asObjectId, type ObjectId } from '../domain/ids.js'
import { richFromPlain } from '../domain/rich-text.js'
import type { BoardAction, Capabilities } from '../ports/capabilities.js'
import { createTestHarness } from '../testing.js'
import type { RevertableChange } from './dispatcher.js'
import type { Command } from './types.js'

/**
 * Taking back somebody else's change (tracks A-2).
 *
 * An agent's change reaches a person's board with no undo entry, because it
 * is not theirs to undo, and so nobody could take it back. `revert` takes
 * back ONE recorded change, from anywhere in history, through the same guards
 * as undo (A-1). Whatever anybody did since wins; a revert with nothing left
 * to do says so; and the revert is the person's own change, so it lands on
 * THEIR undo stack, where Cmd+Z puts the agent's change back.
 */

const id = (name: string): ObjectId => asObjectId(`obj_${name}`)

function harness(capabilities?: Capabilities) {
  const h = createTestHarness(capabilities === undefined ? {} : { capabilities })
  const made = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: ['a', 'b'].map((name, index) => ({
      id: id(name),
      type: 'sticky',
      x: index * 100,
      y: 0,
      data: { text: richFromPlain(name) },
    })),
  })
  if (!made.ok) throw made.error
  return h
}

type Harness = ReturnType<typeof harness>

/**
 * An agent's change as it lands on this board: applied, and NOT on this
 * board's undo stack — what the room delivers, and what the change log
 * records about it.
 */
function agent(h: Harness, label: string, commands: Command[]): RevertableChange {
  const result = h.dispatcher.transact(label, commands, { origin: 'mcp', skipUndo: true })
  if (!result.ok) throw result.error
  return {
    label: result.label,
    forward: result.patches,
    inverse: result.inverse,
    locked: { before: [], after: [] },
  }
}

const x = (h: Harness, name: string) => h.store.getObject(id(name))?.frame.x

describe('reverting a change somebody else made', () => {
  it('takes the whole change back, as one step on the reverter’s own history', () => {
    const h = harness()
    const depth = h.dispatcher.undoStack.depth
    const change = agent(h, 'Add two notes', [
      {
        kind: 'CreateObjects',
        objects: [
          { id: id('n1'), type: 'sticky', x: 0, y: 300 },
          { id: id('n2'), type: 'sticky', x: 100, y: 300 },
        ],
      },
    ])
    expect(h.dispatcher.undoStack.depth).toBe(depth)

    const result = h.dispatcher.revert(change)
    expect(result).toMatchObject({ ok: true, label: 'Revert “Add two notes”' })
    expect(h.store.getObject(id('n1'))).toBeUndefined()
    expect(h.store.getObject(id('n2'))).toBeUndefined()
    expect(h.dispatcher.undoStack.depth).toBe(depth + 1)
    expect(h.dispatcher.undoStack.undoLabel).toBe('Revert “Add two notes”')
  })

  it('is undone by undo, which puts the change back, and redone by redo', () => {
    const h = harness()
    const change = agent(h, 'Move a note', [
      { kind: 'MoveObjects', moves: [{ id: id('a'), dx: 50, dy: 0 }] },
    ])
    expect(h.dispatcher.revert(change).ok).toBe(true)
    expect(x(h, 'a')).toBe(0)

    expect(h.dispatcher.undo()?.ok).toBe(true)
    expect(x(h, 'a')).toBe(50)
    expect(h.dispatcher.redo()?.ok).toBe(true)
    expect(x(h, 'a')).toBe(0)
  })

  it('leaves a property somebody has changed since, and says nothing was left', () => {
    const h = harness()
    const change = agent(h, 'Move a note', [
      { kind: 'MoveObjects', moves: [{ id: id('a'), dx: 50, dy: 0 }] },
    ])
    h.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id: id('a'), dx: 30, dy: 0 }] })

    const result = h.dispatcher.revert(change)
    expect(result).toMatchObject({ ok: false, error: { code: 'stale-history' } })
    expect(x(h, 'a')).toBe(80)
  })

  it('takes back what it still can when part of the change has been edited since', () => {
    const h = harness()
    const change = agent(h, 'Move two notes', [
      {
        kind: 'MoveObjects',
        moves: [
          { id: id('a'), dx: 50, dy: 0 },
          { id: id('b'), dx: 50, dy: 0 },
        ],
      },
    ])
    h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [id('a')] })

    const result = h.dispatcher.revert(change)
    expect(result.ok).toBe(true)
    expect(result.ok && result.affected).toEqual([id('b')])
    expect(x(h, 'b')).toBe(100)
    expect(h.store.getObject(id('a'))).toBeUndefined()
  })

  it('does not reach into an object somebody has locked since', () => {
    const h = harness()
    const change = agent(h, 'Move a note', [
      { kind: 'MoveObjects', moves: [{ id: id('a'), dx: 50, dy: 0 }] },
    ])
    h.dispatcher.dispatch({ kind: 'SetLocked', ids: [id('a')], locked: true })

    expect(h.dispatcher.revert(change)).toMatchObject({
      ok: false,
      error: { code: 'stale-history' },
    })
    expect(x(h, 'a')).toBe(50)
  })

  it('reverts a lock the change itself made, which is not somebody else’s', () => {
    const h = harness()
    const change = agent(h, 'Lock a note', [{ kind: 'SetLocked', ids: [id('a')], locked: true }])
    const recorded = { ...change, locked: { before: [], after: [id('a')] } }

    expect(h.dispatcher.revert(recorded).ok).toBe(true)
    expect(h.store.getObject(id('a'))?.locked).toBe(false)
  })

  it('is refused to somebody who may not edit, and changes nothing', () => {
    let allowed: readonly BoardAction[] = ['view', 'comment', 'edit']
    const h = harness({ can: (action) => allowed.includes(action) })
    const change = agent(h, 'Move a note', [
      { kind: 'MoveObjects', moves: [{ id: id('a'), dx: 50, dy: 0 }] },
    ])
    allowed = ['view', 'comment']

    expect(h.dispatcher.revert(change)).toMatchObject({
      ok: false,
      error: { code: 'unauthorized' },
    })
    expect(x(h, 'a')).toBe(50)
  })

  it('carries the origin it is given, so an agent’s revert is recorded as the agent’s', () => {
    const h = harness()
    const change = agent(h, 'Move a note', [
      { kind: 'MoveObjects', moves: [{ id: id('a'), dx: 50, dy: 0 }] },
    ])
    expect(h.dispatcher.revert(change, { origin: 'mcp' })).toMatchObject({
      ok: true,
      origin: 'mcp',
    })
  })

  /*
   * A recorded change arrives from the shared log, which any editor of the
   * board can write to, so what it would put back is checked like anything
   * else arriving from another client. Undo replays this board's OWN history
   * and does not need it; a revert takes somebody else's word for what the
   * board looked like.
   */
  it('puts back nothing that is not a valid object', () => {
    const h = harness()
    const change = agent(h, 'Delete a note', [{ kind: 'DeleteObjects', ids: [id('a')] }])
    const [restore] = change.inverse
    if (restore?.op !== 'add') throw new Error('expected the inverse of a delete to add')
    const hostile: RevertableChange = {
      ...change,
      inverse: [
        {
          ...restore,
          object: { ...restore.object, frame: { ...restore.object.frame, width: 'wide' } },
        } as unknown as typeof restore,
      ],
    }

    expect(h.dispatcher.revert(hostile)).toMatchObject({
      ok: false,
      error: { code: 'stale-history' },
    })
    expect(h.store.getObject(id('a'))).toBeUndefined()
    expect(h.dispatcher.revert(change).ok).toBe(true)
    expect(h.store.getObject(id('a'))).toBeDefined()
  })
})
