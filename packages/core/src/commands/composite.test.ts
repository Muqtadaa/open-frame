import { describe, expect, it } from 'vitest'

import { childrenOf } from '../domain/document.js'
import { asObjectId, type ObjectId } from '../domain/ids.js'
import { createTestHarness, type TestHarness } from '../testing.js'
import type { Command } from './types.js'

/**
 * The edits that are several commands to the document but ONE thing to a
 * person — group, ungroup, align, distribute, duplicate, derive.
 *
 * They used to be assembled inside a React hook, which meant nothing but a
 * browser could test them and nothing but the web app could perform them: an
 * agent that wanted to group two notes had to know to create a group and then
 * reparent into it, in that order, in one transaction. Each is now a command,
 * with the same validation, locking and undo as any other.
 */

function create(
  h: TestHarness,
  type: string,
  x = 0,
  y = 0,
  extra: { width?: number; height?: number; parentId?: ObjectId } = {},
): ObjectId {
  const result = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [{ type, x, y, ...extra }],
  })
  if (!result.ok) throw result.error
  const id = result.affected[0]
  if (id === undefined) throw new Error('expected an id')
  return id
}

function run(h: TestHarness, command: Command) {
  return h.dispatcher.dispatch(command)
}

const frameOf = (h: TestHarness, id: ObjectId) => h.store.getObject(id)?.frame

describe('GroupObjects', () => {
  it('wraps the objects in a new group, as one undo step', () => {
    const h = createTestHarness()
    const a = create(h, 'sticky', 0, 0)
    const b = create(h, 'sticky', 300, 0)
    const id = asObjectId('obj_group')

    const result = run(h, { kind: 'GroupObjects', ids: [a, b], id })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.label).toBe('Group')
    expect(h.store.getObject(id)?.type).toBe('group')
    expect(childrenOf(h.store.getDocument(), id).map((o) => o.id)).toEqual([a, b])

    h.dispatcher.undo()
    expect(h.store.getObject(id)).toBeUndefined()
    expect(h.store.getObject(a)?.parentId).toBeNull()
  })

  it('puts the group where its members were, inside their frame', () => {
    const h = createTestHarness()
    const frame = create(h, 'frame', 0, 0, { width: 800, height: 600 })
    const a = create(h, 'sticky', 10, 10, { parentId: frame })
    const b = create(h, 'sticky', 300, 10, { parentId: frame })
    const id = asObjectId('obj_group')

    expect(run(h, { kind: 'GroupObjects', ids: [a, b], id }).ok).toBe(true)
    expect(h.store.getObject(id)?.parentId).toBe(frame)
  })

  it('refuses one object, which is already a unit', () => {
    const h = createTestHarness()
    const a = create(h, 'sticky')
    const result = run(h, { kind: 'GroupObjects', ids: [a] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-input')
  })

  /** Grouping must not lift an object out of its frame as a side effect. */
  it('refuses objects with different parents', () => {
    const h = createTestHarness()
    const frame = create(h, 'frame', 0, 0, { width: 400, height: 400 })
    const inside = create(h, 'sticky', 10, 10, { parentId: frame })
    const outside = create(h, 'sticky', 600, 0)
    const result = run(h, { kind: 'GroupObjects', ids: [inside, outside] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-input')
    expect(h.store.getDocument().objects.size).toBe(3)
  })

  it('refuses a locked member, leaving the board as it was', () => {
    const h = createTestHarness()
    const a = create(h, 'sticky')
    const b = create(h, 'sticky', 300, 0)
    run(h, { kind: 'SetLocked', ids: [b], locked: true })
    const result = run(h, { kind: 'GroupObjects', ids: [a, b] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('object-locked')
    expect(h.store.getDocument().objects.size).toBe(2)
  })
})

describe('UngroupObjects', () => {
  function grouped() {
    const h = createTestHarness()
    const frame = create(h, 'frame', 0, 0, { width: 800, height: 600 })
    const a = create(h, 'sticky', 10, 10, { parentId: frame })
    const b = create(h, 'sticky', 300, 10, { parentId: frame })
    const group = asObjectId('obj_group')
    const made = run(h, { kind: 'GroupObjects', ids: [a, b], id: group })
    if (!made.ok) throw made.error
    return { h, frame, a, b, group }
  }

  /**
   * Members are lifted out BEFORE the group goes. The other order cascades the
   * delete into its own contents, and ungrouping deletes what was grouped.
   */
  it('keeps the members, handing them to the group’s own parent', () => {
    const { h, frame, a, b, group } = grouped()
    const result = run(h, { kind: 'UngroupObjects', ids: [group] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.label).toBe('Ungroup')
    expect(h.store.getObject(group)).toBeUndefined()
    expect(h.store.getObject(a)?.parentId).toBe(frame)
    expect(h.store.getObject(b)?.parentId).toBe(frame)
  })

  it('comes back whole on undo', () => {
    const { h, a, b, group } = grouped()
    run(h, { kind: 'UngroupObjects', ids: [group] })
    h.dispatcher.undo()
    expect(h.store.getObject(group)?.type).toBe('group')
    expect(childrenOf(h.store.getDocument(), group).map((o) => o.id)).toEqual([a, b])
  })

  /** A mixed selection ungroups what it can; a note in it is left alone. */
  it('passes over what is not a group, and refuses a selection with none', () => {
    const { h, group } = grouped()
    const loose = create(h, 'sticky', 900, 900)
    expect(run(h, { kind: 'UngroupObjects', ids: [group, loose] }).ok).toBe(true)
    expect(h.store.getObject(loose)).toBeDefined()

    const none = run(h, { kind: 'UngroupObjects', ids: [loose] })
    expect(none.ok).toBe(false)
    if (!none.ok) expect(none.error.code).toBe('invalid-input')
  })

  it('refuses a locked group', () => {
    const { h, group } = grouped()
    run(h, { kind: 'SetLocked', ids: [group], locked: true })
    const result = run(h, { kind: 'UngroupObjects', ids: [group] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('object-locked')
  })
})

describe('AlignObjects', () => {
  /*
   * Off the grid on purpose (rule 17): the positions are ones only the
   * selection's own box could produce.
   */
  it('lines everything up on the selection’s own edge, labelled for the edge', () => {
    const h = createTestHarness()
    const a = create(h, 'sticky', 37, 0)
    const b = create(h, 'sticky', 213, 300)
    const result = run(h, { kind: 'AlignObjects', ids: [a, b], edge: 'left' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.label).toBe('Align left')
    expect(frameOf(h, b)?.x).toBe(37)
    expect(frameOf(h, a)?.x).toBe(37)
  })

  /**
   * A locked object is part of what was selected, so it still sets the line —
   * it just does not move to it.
   */
  it('lines up TO a locked object without moving it', () => {
    const h = createTestHarness()
    const pinned = create(h, 'sticky', 37, 0)
    const free = create(h, 'sticky', 213, 300)
    run(h, { kind: 'SetLocked', ids: [pinned], locked: true })
    expect(run(h, { kind: 'AlignObjects', ids: [pinned, free], edge: 'left' }).ok).toBe(true)
    expect(frameOf(h, free)?.x).toBe(37)
  })

  /** A connector is wherever its ends are; lining it up would change nothing. */
  it('leaves out a type whose shape is its ends', () => {
    const h = createTestHarness()
    const a = create(h, 'sticky', 37, 0)
    const b = create(h, 'sticky', 213, 300)
    const line = h.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [
        {
          type: 'connector',
          x: 0,
          y: 0,
          data: { from: { kind: 'point', x: -500, y: 0 }, to: { kind: 'point', x: -400, y: 0 } },
        },
      ],
    })
    if (!line.ok) throw line.error
    const connector = line.affected[0]
    if (connector === undefined) throw new Error('expected a connector')

    expect(run(h, { kind: 'AlignObjects', ids: [a, b, connector], edge: 'left' }).ok).toBe(true)
    // Had the connector counted, the line would be at -500.
    expect(frameOf(h, b)?.x).toBe(37)
  })

  it('costs no undo step when everything is already in line', () => {
    const h = createTestHarness()
    const a = create(h, 'sticky', 37, 0)
    const b = create(h, 'sticky', 37, 300)
    const result = run(h, { kind: 'AlignObjects', ids: [a, b], edge: 'left' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.patches).toEqual([])
    h.dispatcher.undo()
    // The undo reached the creation instead.
    expect(h.store.getObject(b)).toBeUndefined()
  })
})

describe('DistributeObjects', () => {
  it('evens out the gaps, keeping the outer two where they are', () => {
    const h = createTestHarness()
    const a = create(h, 'sticky', 0, 0, { width: 100, height: 100 })
    const b = create(h, 'sticky', 137, 0, { width: 100, height: 100 })
    const c = create(h, 'sticky', 500, 0, { width: 100, height: 100 })
    const result = run(h, { kind: 'DistributeObjects', ids: [a, b, c], axis: 'x' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.label).toBe('Distribute horizontally')
    expect(frameOf(h, a)?.x).toBe(0)
    expect(frameOf(h, b)?.x).toBe(250)
    expect(frameOf(h, c)?.x).toBe(500)
  })
})

describe('DuplicateObjects', () => {
  it('copies geometry, style and data under new ids, offset so it reads as a copy', () => {
    const h = createTestHarness()
    const note = create(h, 'sticky', 40, 40)
    run(h, { kind: 'UpdateStyle', ids: [note], style: { color: 'blue' } })
    run(h, { kind: 'UpdateObjectData', id: note, patch: { text: 'Keep me' } })

    const result = run(h, { kind: 'DuplicateObjects', ids: [note], dx: 24, dy: 24 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const copyId = result.affected[0]
    expect(copyId).toBeDefined()
    expect(copyId).not.toBe(note)
    if (copyId === undefined) return
    const original = h.store.getObject(note)
    const copy = h.store.getObject(copyId)
    expect(copy?.frame.x).toBe(64)
    expect(copy?.frame.y).toBe(64)
    expect(copy?.style).toEqual(original?.style)
    expect(copy?.data).toEqual(original?.data)
  })

  it('refuses an object that is not there', () => {
    const h = createTestHarness()
    const result = run(h, {
      kind: 'DuplicateObjects',
      ids: [asObjectId('obj_gone')],
      dx: 24,
      dy: 24,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('unknown-object')
  })
})

describe('DeriveObject', () => {
  /**
   * The new object is the one making the claim, so the relations point FROM it
   * to what it was drawn from — and they come and go with it, because an
   * insight whose provenance vanished on undo is the one thing this product
   * must not contain.
   */
  it('creates the object and one relation to each source, all undone together', () => {
    const h = createTestHarness()
    const a = create(h, 'evidence', 0, 0)
    const b = create(h, 'evidence', 300, 0)
    const id = asObjectId('obj_insight')

    const result = run(h, {
      kind: 'DeriveObject',
      toType: 'insight',
      from: [a, b],
      predicate: 'cites',
      x: 120,
      y: -200,
      id,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.label).toBe('Derive insight')
    expect(h.store.getObject(id)?.frame.x).toBe(120)

    const relations = [...h.store.getDocument().objects.values()].filter(
      (object) => object.type === 'relation',
    )
    expect(relations.map((r) => r.data)).toEqual([
      { from: id, to: a, predicate: 'cites' },
      { from: id, to: b, predicate: 'cites' },
    ])

    h.dispatcher.undo()
    expect(h.store.getDocument().objects.size).toBe(2)
  })

  it('refuses sources with no place on the board', () => {
    const h = createTestHarness()
    const a = create(h, 'evidence', 0, 0)
    const insight = create(h, 'insight', 0, -200)
    const cited = h.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [
        { type: 'relation', x: 0, y: 0, data: { from: insight, to: a, predicate: 'cites' } },
      ],
    })
    if (!cited.ok) throw cited.error
    const relation = cited.affected[0]
    if (relation === undefined) throw new Error('expected a relation')

    const result = run(h, {
      kind: 'DeriveObject',
      toType: 'hypothesis',
      from: [relation],
      predicate: 'derives-from',
      x: 0,
      y: 0,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-input')
  })

  it('refuses a type nobody registered', () => {
    const h = createTestHarness()
    const a = create(h, 'evidence')
    const result = run(h, {
      kind: 'DeriveObject',
      toType: 'prophecy',
      from: [a],
      predicate: 'cites',
      x: 0,
      y: 0,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('unknown-type')
  })
})

/**
 * A derivation is provenance, so only the pairings the types DECLARE may be
 * recorded. The menu only ever offered those; a caller that builds the
 * command itself — an agent, the API — must be held to the same list, or it
 * can stand a task on a sticky that nothing says a task can stand on.
 */
describe('DeriveObject, against what the sources declare', () => {
  it('refuses a type the source does not derive', () => {
    const h = createTestHarness()
    const note = create(h, 'sticky')
    const result = run(h, {
      kind: 'DeriveObject',
      toType: 'task',
      from: [note],
      predicate: 'implements',
      x: 0,
      y: -200,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-input')
    expect(h.store.getDocument().objects.size).toBe(1)
  })

  it('refuses a declared type under a predicate it was not declared with', () => {
    const h = createTestHarness()
    const note = create(h, 'sticky')
    const result = run(h, {
      kind: 'DeriveObject',
      toType: 'insight',
      from: [note],
      predicate: 'refutes',
      x: 0,
      y: -200,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-input')
  })

  it('refuses a mixed selection when one source cannot derive it', () => {
    const h = createTestHarness()
    const evidence = create(h, 'evidence')
    const task = create(h, 'task', 300, 0)
    const result = run(h, {
      kind: 'DeriveObject',
      toType: 'insight',
      from: [evidence, task],
      predicate: 'cites',
      x: 0,
      y: -200,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-input')
  })

  it('allows what every source declares', () => {
    const h = createTestHarness()
    const note = create(h, 'sticky')
    const evidence = create(h, 'evidence', 300, 0)
    const result = run(h, {
      kind: 'DeriveObject',
      toType: 'insight',
      from: [note, evidence],
      predicate: 'cites',
      x: 0,
      y: -200,
    })
    expect(result.ok).toBe(true)
  })
})
