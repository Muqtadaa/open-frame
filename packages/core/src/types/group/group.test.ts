import { beforeEach, describe, expect, it } from 'vitest'

import { childrenOf } from '../../domain/document.js'
import { asObjectId, type ObjectId } from '../../domain/ids.js'
import { createTestHarness, type TestHarness } from '../../testing.js'

function create(
  h: TestHarness,
  type: string,
  x = 0,
  y = 0,
  extra: Record<string, unknown> = {},
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

function object(h: TestHarness, id: ObjectId) {
  const found = h.store.getObject(id)
  if (found === undefined) throw new Error(`object ${id} is missing`)
  return found
}

describe('group bounds', () => {
  let h: TestHarness

  beforeEach(() => {
    h = createTestHarness()
  })

  it('spans its children', () => {
    const group = create(h, 'group')
    create(h, 'sticky', 0, 0, { parentId: group }) // 180x180
    create(h, 'sticky', 400, 200, { parentId: group })

    const bounds = h.registry.boundsOf(object(h, group), h.store.getDocument())
    expect(bounds).toEqual({ x: 0, y: 0, width: 580, height: 380 })
  })

  /** Rule 16: the extent is derived, so it must follow a member without any write. */
  it('follows a member that moves, without the group being patched', () => {
    const group = create(h, 'group')
    const note = create(h, 'sticky', 0, 0, { parentId: group })
    create(h, 'sticky', 100, 100, { parentId: group })
    const before = object(h, group)

    h.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id: note, dx: -300, dy: 0 }] })

    const after = object(h, group)
    // Same object, different answer.
    expect(after.frame).toEqual(before.frame)
    expect(h.registry.boundsOf(after, h.store.getDocument()).x).toBe(-300)
  })

  /**
   * A group holding a connector is the obvious thing to do — a diagram with its
   * arrows — and a connector's frame is 0x0, so using frames here would clip.
   */
  it('uses a child connector\'s derived extent, not its empty frame', () => {
    const group = create(h, 'group')
    create(h, 'connector', 0, 0, {
      parentId: group,
      data: { from: { kind: 'point', x: 0, y: 0 }, to: { kind: 'point', x: 900, y: 500 } },
    })

    const bounds = h.registry.boundsOf(object(h, group), h.store.getDocument())
    expect(bounds.width).toBeGreaterThan(890)
    expect(bounds.height).toBeGreaterThan(490)
  })

  it('nests, taking the outer group all the way down', () => {
    const outer = create(h, 'group')
    const inner = create(h, 'group', 0, 0, { parentId: outer })
    create(h, 'sticky', 500, 500, { parentId: inner })
    create(h, 'sticky', 0, 0, { parentId: outer })

    const bounds = h.registry.boundsOf(object(h, outer), h.store.getDocument())
    expect(bounds).toEqual({ x: 0, y: 0, width: 680, height: 680 })
  })

  it('collapses to nothing when empty rather than throwing', () => {
    const group = create(h, 'group')
    expect(h.registry.boundsOf(object(h, group), h.store.getDocument())).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    })
  })
})

describe('group behaviour', () => {
  let h: TestHarness

  beforeEach(() => {
    h = createTestHarness()
  })

  it('is never hit directly, only through a member', () => {
    const group = create(h, 'group')
    create(h, 'sticky', 0, 0, { parentId: group })
    // Dead centre of the group's own bounds.
    expect(h.registry.hitTestObject(object(h, group), h.store.getDocument(), { x: 90, y: 90 })).toBe(
      false,
    )
  })

  it('declares itself as selecting as a unit, which nothing else does', () => {
    const selectAsUnit = h.registry
      .list()
      .filter((definition) => definition.capabilities.selectsAsUnit)
      .map((definition) => definition.type)
    expect(selectAsUnit).toEqual(['group'])
  })

  it('takes its members with it when deleted', () => {
    const group = create(h, 'group')
    create(h, 'sticky', 0, 0, { parentId: group })
    create(h, 'sticky', 200, 0, { parentId: group })

    h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [group] })
    expect(h.store.getDocument().objects.size).toBe(0)
  })

  it('rejects a payload rather than silently discarding it', () => {
    const definition = h.registry.get('group')
    expect(definition?.validate({ smuggled: true }).ok).toBe(false)
    expect(definition?.validate({}).ok).toBe(true)
  })
})

describe('caller-supplied ids', () => {
  let h: TestHarness

  beforeEach(() => {
    h = createTestHarness()
  })

  /**
   * What makes grouping a single transaction: the reparent has to name the
   * container the create is about to make.
   */
  it('lets a later command in one transaction refer to an earlier creation', () => {
    const groupId = asObjectId('obj_group_1')
    const note = create(h, 'sticky', 0, 0)
    const other = create(h, 'sticky', 300, 0)

    const result = h.dispatcher.transact('Group', [
      { kind: 'CreateObjects', objects: [{ type: 'group', id: groupId, x: 0, y: 0 }] },
      { kind: 'ReparentObjects', ids: [note, other], parentId: groupId },
    ])

    expect(result.ok).toBe(true)
    expect(childrenOf(h.store.getDocument(), groupId).map((o) => o.id).sort()).toEqual(
      [note, other].sort(),
    )
  })

  it('is one undo entry, not two', () => {
    const groupId = asObjectId('obj_group_2')
    const note = create(h, 'sticky', 0, 0)

    h.dispatcher.transact('Group', [
      { kind: 'CreateObjects', objects: [{ type: 'group', id: groupId, x: 0, y: 0 }] },
      { kind: 'ReparentObjects', ids: [note], parentId: groupId },
    ])
    h.dispatcher.undo()

    expect(h.store.getObject(groupId)).toBeUndefined()
    expect(object(h, note).parentId).toBeNull()
  })

  /** Overwriting would destroy an object and invert to restore the wrong one. */
  it('refuses an id that already exists', () => {
    const note = create(h, 'sticky', 0, 0)
    const result = h.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ type: 'group', id: note, x: 0, y: 0 }],
    })
    expect(result.ok).toBe(false)
  })

  it('refuses the same id twice within one command', () => {
    const id = asObjectId('obj_dup')
    const result = h.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [
        { type: 'group', id, x: 0, y: 0 },
        { type: 'group', id, x: 0, y: 0 },
      ],
    })
    expect(result.ok).toBe(false)
  })

  it('still mints an id when none is supplied', () => {
    const id = create(h, 'sticky', 0, 0)
    expect(id).toMatch(/^obj_/)
  })
})
