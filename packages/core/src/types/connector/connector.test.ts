import { beforeEach, describe, expect, it } from 'vitest'

import type { ObjectId } from '../../domain/ids.js'
import { createTestHarness, type TestHarness } from '../../testing.js'
import { resolveEndpoints } from './geometry.js'
import type { ConnectorData } from './schema.js'

function create(
  h: TestHarness,
  type: string,
  x = 0,
  y = 0,
  data?: Record<string, unknown>,
): ObjectId {
  const result = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [{ type, x, y, ...(data === undefined ? {} : { data }) }],
  })
  if (!result.ok) throw result.error
  const id = result.affected[0]
  if (id === undefined) throw new Error('expected an id')
  return id
}

function connectorData(h: TestHarness, id: ObjectId): ConnectorData {
  return h.store.getObject(id)?.data as ConnectorData
}

describe('endpoint resolution', () => {
  let h: TestHarness
  let a: ObjectId
  let b: ObjectId

  beforeEach(() => {
    h = createTestHarness()
    a = create(h, 'sticky', 0, 0) // 180x180
    b = create(h, 'sticky', 500, 0)
  })

  it('resolves a free point to itself', () => {
    const { start } = resolveEndpoints(
      h.store.getDocument(),
      { kind: 'point', x: 7, y: 9 },
      { kind: 'point', x: 0, y: 0 },
    )
    expect(start).toEqual({ x: 7, y: 9 })
  })

  it('resolves a side anchor to that edge', () => {
    const { start } = resolveEndpoints(
      h.store.getDocument(),
      { kind: 'object', objectId: a, anchor: { kind: 'side', side: 'right' } },
      { kind: 'point', x: 999, y: 90 },
    )
    expect(start).toEqual({ x: 180, y: 90 })
  })

  /** Normalised anchors are what let an attachment survive a resize. */
  it('keeps a relative anchor proportional when the target resizes', () => {
    const endpoint = {
      kind: 'object' as const,
      objectId: a,
      anchor: { kind: 'relative' as const, u: 1, v: 0.5 },
    }
    const far = { kind: 'point' as const, x: 999, y: 90 }

    const before = resolveEndpoints(h.store.getDocument(), endpoint, far).start
    h.dispatcher.dispatch({
      kind: 'ResizeObjects',
      resizes: [{ id: a, frame: { x: 0, y: 0, width: 360, height: 180, rotation: 0 } }],
    })
    const after = resolveEndpoints(h.store.getDocument(), endpoint, far).start

    expect(before.x).toBe(180)
    expect(after.x).toBe(360)
  })

  it('points auto anchors at each other', () => {
    const { start, end } = resolveEndpoints(
      h.store.getDocument(),
      { kind: 'object', objectId: a, anchor: { kind: 'auto' } },
      { kind: 'object', objectId: b, anchor: { kind: 'auto' } },
    )
    // a is left of b, so they should meet on a's right and b's left edge.
    expect(start.x).toBe(180)
    expect(end.x).toBe(500)
  })

  it('does not throw on a dangling reference', () => {
    const { start } = resolveEndpoints(
      h.store.getDocument(),
      { kind: 'object', objectId: 'obj_gone' as ObjectId, anchor: { kind: 'auto' } },
      { kind: 'point', x: 10, y: 10 },
    )
    expect(Number.isFinite(start.x)).toBe(true)
  })
})

/**
 * The behaviour agreed before building: one orphaned end becomes a free point
 * so the connector survives; two orphaned ends delete it, because a line
 * between two things that no longer exist is litter.
 */
describe('deleting an attached object', () => {
  let h: TestHarness
  let a: ObjectId
  let b: ObjectId
  let connector: ObjectId

  beforeEach(() => {
    h = createTestHarness()
    a = create(h, 'sticky', 0, 0)
    b = create(h, 'sticky', 500, 0)
    connector = create(h, 'connector', 0, 0, {
      from: { kind: 'object', objectId: a, anchor: { kind: 'auto' } },
      to: { kind: 'object', objectId: b, anchor: { kind: 'auto' } },
    })
  })

  it('converts the orphaned end to a free point', () => {
    h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [a] })

    const data = connectorData(h, connector)
    expect(data.from.kind).toBe('point')
    expect(data.to.kind).toBe('object')
  })

  it('freezes the free point where the end last rendered', () => {
    const before = resolveEndpoints(
      h.store.getDocument(),
      connectorData(h, connector).from,
      connectorData(h, connector).to,
    ).start

    h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [a] })

    const after = connectorData(h, connector).from
    expect(after.kind).toBe('point')
    if (after.kind !== 'point') return
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
  })

  it('deletes the connector when both ends are orphaned', () => {
    h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [a, b] })
    expect(h.store.getObject(connector)).toBeUndefined()
  })

  it('deletes the connector when a frame containing both ends is deleted', () => {
    const frame = create(h, 'frame', -50, -50)
    h.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [a, b], parentId: frame })
    h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [frame] })
    expect(h.store.getObject(connector)).toBeUndefined()
  })

  it('leaves unrelated connectors alone', () => {
    const c = create(h, 'sticky', 900, 0)
    const other = create(h, 'connector', 0, 0, {
      from: { kind: 'object', objectId: b, anchor: { kind: 'auto' } },
      to: { kind: 'object', objectId: c, anchor: { kind: 'auto' } },
    })
    h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [a] })
    expect(connectorData(h, other).from.kind).toBe('object')
  })

  it('restores the attachment on undo', () => {
    h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [a] })
    h.dispatcher.undo()

    const data = connectorData(h, connector)
    expect(data.from.kind).toBe('object')
    if (data.from.kind !== 'object') return
    expect(data.from.objectId).toBe(a)
  })

  it('restores a both-ends deletion on undo', () => {
    h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [a, b] })
    h.dispatcher.undo()
    expect(h.store.getObject(connector)).toBeDefined()
    expect(connectorData(h, connector).from.kind).toBe('object')
  })
})

describe('connector bounds', () => {
  it('spans its endpoints rather than using its frame', () => {
    const h = createTestHarness()
    const a = create(h, 'sticky', 0, 0)
    const b = create(h, 'sticky', 600, 400)
    const connector = create(h, 'connector', 0, 0, {
      from: { kind: 'object', objectId: a, anchor: { kind: 'auto' } },
      to: { kind: 'object', objectId: b, anchor: { kind: 'auto' } },
    })

    const object = h.store.getObject(connector)
    expect(object).toBeDefined()
    if (object === undefined) return
    expect(object.frame.width).toBe(0)

    const bounds = h.registry.boundsOf(object, h.store.getDocument())
    expect(bounds.width).toBeGreaterThan(300)
    expect(bounds.height).toBeGreaterThan(200)
  })

  /** Moving an endpoint's object must NOT patch the connector. */
  it('follows a moved endpoint without being written to', () => {
    const h = createTestHarness()
    const a = create(h, 'sticky', 0, 0)
    const b = create(h, 'sticky', 500, 0)
    const connector = create(h, 'connector', 0, 0, {
      from: { kind: 'object', objectId: a, anchor: { kind: 'auto' } },
      to: { kind: 'object', objectId: b, anchor: { kind: 'auto' } },
    })

    const result = h.dispatcher.dispatch({
      kind: 'MoveObjects',
      moves: [{ id: a, dx: 0, dy: 300 }],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.affected).not.toContain(connector)

    const object = h.store.getObject(connector)
    if (object === undefined) return
    const bounds = h.registry.boundsOf(object, h.store.getDocument())
    expect(bounds.height).toBeGreaterThan(200)
  })
})
