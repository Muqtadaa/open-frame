import { beforeEach, describe, expect, it } from 'vitest'

import type { ObjectId } from '../../domain/ids.js'
import type { AnyOpenFrameObject } from '../../domain/object.js'
import { createTestHarness, type TestHarness } from '../../testing.js'
import { attachmentAnchor, resolveEndpoints } from './geometry.js'
import type { ConnectorData } from './schema.js'

/**
 * The REAL extent of whatever an end is attached to, which is what the
 * registry answers and what the renderer draws against.
 *
 * A sticky's frame IS its extent, so these tests would pass reading the frame
 * — which is exactly why the group case has a test of its own. A group's frame
 * is 0x0 and its children are the truth.
 */
function extentIn(h: TestHarness) {
  return (object: AnyOpenFrameObject) => h.registry.boundsOf(object, h.store.getDocument())
}

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
      extentIn(h),
    )
    expect(start).toEqual({ x: 7, y: 9 })
  })

  it('resolves a side anchor to that edge', () => {
    const { start } = resolveEndpoints(
      h.store.getDocument(),
      { kind: 'object', objectId: a, anchor: { kind: 'side', side: 'right' } },
      { kind: 'point', x: 999, y: 90 },
      extentIn(h),
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

    const before = resolveEndpoints(h.store.getDocument(), endpoint, far, extentIn(h)).start
    h.dispatcher.dispatch({
      kind: 'ResizeObjects',
      resizes: [{ id: a, frame: { x: 0, y: 0, width: 360, height: 180, rotation: 0 } }],
    })
    const after = resolveEndpoints(h.store.getDocument(), endpoint, far, extentIn(h)).start

    expect(before.x).toBe(180)
    expect(after.x).toBe(360)
  })

  /**
   * A CONTAINER, whose frame is not where it is.
   *
   * A group's frame is 0x0 by design — its extent is its children's union,
   * reported by `getBounds` — so an anchor read off the frame resolved to the
   * group's origin, and a line joined to a group ran to a corner of the board
   * instead of to the thing it was joined to. This is rule 16 inside the
   * connector's own geometry: anything needing bounds asks the registry.
   */
  it('attaches to a container where it actually IS, not to its 0x0 frame', () => {
    const group = create(h, 'group', 0, 0)
    h.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [a, b], parentId: group })

    const held = h.store.getObject(group)
    if (held === undefined) throw new Error('the group went missing')
    // The premise: its own frame says nothing about where it is.
    expect(held.frame.width).toBe(0)
    const extent = extentIn(h)(held)
    expect(extent.width).toBeGreaterThan(0)

    const { start } = resolveEndpoints(
      h.store.getDocument(),
      { kind: 'object', objectId: group, anchor: { kind: 'side', side: 'right' } },
      { kind: 'point', x: 5000, y: 90 },
      extentIn(h),
    )
    expect(start.x).toBeCloseTo(extent.x + extent.width, 6)
    expect(start.y).toBeCloseTo(extent.y + extent.height / 2, 6)
  })

  it('aims at a container\'s anchors where they are drawn, not at its origin', () => {
    const group = create(h, 'group', 0, 0)
    h.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [a, b], parentId: group })
    const held = h.store.getObject(group)
    if (held === undefined) throw new Error('the group went missing')

    const extent = extentIn(h)(held)
    const onItsLeftEdge = { x: extent.x, y: extent.y + extent.height / 2 }
    expect(attachmentAnchor(held, onItsLeftEdge, 38, extentIn(h))).toEqual({
      kind: 'side',
      side: 'left',
    })
    // And its 0x0 frame is not an anchor of anything.
    expect(attachmentAnchor(held, { x: held.frame.x, y: held.frame.y }, 38, extentIn(h))).toEqual({
      kind: 'auto',
    })
  })

  /**
   * And the other half of the same decision. Bounds are AXIS-ALIGNED, so for a
   * turned object they describe the box around the rectangle rather than where
   * its edges are — and the rotation is already inside them, so applying it
   * again would turn the anchor twice. A rotated object's own frame is the
   * honest answer, which is only safe because nothing both rotates and keeps
   * its extent somewhere else.
   */
  it('keeps a turned object\'s anchor on its turned edge', () => {
    // A SHAPE, because a sticky note is deliberately not rotatable — the
    // command refuses it, and a test that ignored the refusal would be
    // asserting about an object that never turned.
    const shape = create(h, 'shape', 0, 0)
    const result = h.dispatcher.dispatch({
      kind: 'RotateObjects',
      rotations: [{ id: shape, rotation: Math.PI / 4 }],
    })
    expect(result.ok).toBe(true)
    const turned = h.store.getObject(shape)
    if (turned === undefined) throw new Error('the object went missing')
    expect(turned.frame.rotation).toBeCloseTo(Math.PI / 4, 6)

    const { start } = resolveEndpoints(
      h.store.getDocument(),
      { kind: 'object', objectId: shape, anchor: { kind: 'side', side: 'right' } },
      { kind: 'point', x: 5000, y: turned.frame.y },
      extentIn(h),
    )

    const box = extentIn(h)(turned)
    // The axis-aligned box AROUND a turned rectangle is wider than the
    // rectangle, and the anchor belongs on the rectangle — inside that box.
    expect(box.width).toBeGreaterThan(turned.frame.width + 1)
    expect(start.x).toBeLessThan(box.x + box.width - 1)

    // Exactly half the width from the centre, turned: that is where the
    // midpoint of the right edge goes.
    const centre = {
      x: turned.frame.x + turned.frame.width / 2,
      y: turned.frame.y + turned.frame.height / 2,
    }
    expect(Math.hypot(start.x - centre.x, start.y - centre.y)).toBeCloseTo(
      turned.frame.width / 2,
      6,
    )
  })

  it('points auto anchors at each other', () => {
    const { start, end } = resolveEndpoints(
      h.store.getDocument(),
      { kind: 'object', objectId: a, anchor: { kind: 'auto' } },
      { kind: 'object', objectId: b, anchor: { kind: 'auto' } },
      extentIn(h),
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
      extentIn(h),
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
      extentIn(h),
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

/**
 * Dragging an existing endpoint to somewhere else.
 *
 * The registry surface is deliberately generic — `endpoints` and
 * `retargetEndpoint` name no connector concept — so the overlay that draws the
 * handles never has to ask what type it is looking at.
 */
describe('draggable endpoints', () => {
  let h: TestHarness
  let a: ObjectId
  let b: ObjectId
  let c: ObjectId
  let connector: ObjectId

  beforeEach(() => {
    h = createTestHarness()
    a = create(h, 'sticky', 0, 0)
    b = create(h, 'sticky', 500, 0)
    c = create(h, 'sticky', 1000, 400)
    connector = create(h, 'connector', 0, 0, {
      from: { kind: 'object', objectId: a, anchor: { kind: 'auto' } },
      to: { kind: 'object', objectId: b, anchor: { kind: 'auto' } },
    })
  })

  const object = () => {
    const found = h.store.getObject(connector)
    if (found === undefined) throw new Error('connector went missing')
    return found
  }

  /** The middle of an object's face, which is a drop that aims at no anchor. */
  const middleOf = (id: ObjectId): { x: number; y: number } => {
    const found = h.store.getObject(id)
    if (found === undefined) throw new Error('object went missing')
    return {
      x: found.frame.x + found.frame.width / 2,
      y: found.frame.y + found.frame.height / 2,
    }
  }

  /** The anchor on one side of an object, as a drop that aims straight at it. */
  const anchorOf = (id: ObjectId, side: 'top' | 'right' | 'bottom' | 'left') => {
    const found = h.store.getObject(id)
    if (found === undefined) throw new Error('object went missing')
    const { x, y, width, height } = found.frame
    if (side === 'top') return { x: x + width / 2, y }
    if (side === 'bottom') return { x: x + width / 2, y: y + height }
    if (side === 'left') return { x, y: y + height / 2 }
    return { x: x + width, y: y + height / 2 }
  }

  /**
   * How close counts, in world units. The app passes the reach of a connection
   * point's own target divided by the zoom; this is that number at 100%.
   */
  const REACH = 38

  it('reports both ends, where they resolve to', () => {
    const ends = h.registry.endpointsOf(object(), h.store.getDocument())
    expect(ends.map((e) => e.id)).toEqual(['from', 'to'])
    // Attached ends sit on the edge of their object, not at its origin.
    expect(ends[0]?.at.x).toBeGreaterThan(0)
  })

  it('names the object each end is attached to', () => {
    const ends = h.registry.endpointsOf(object(), h.store.getDocument())
    expect(ends[0]?.attachedTo).toBe(a)
    expect(ends[1]?.attachedTo).toBe(b)
  })

  it('leaves a free end with no attachment', () => {
    const free = create(h, 'connector', 0, 0, {
      from: { kind: 'point', x: 10, y: 20 },
      to: { kind: 'point', x: 90, y: 20 },
    })
    const found = h.store.getObject(free)
    if (found === undefined) throw new Error('missing')
    const ends = h.registry.endpointsOf(found, h.store.getDocument())
    expect(ends[0]?.attachedTo).toBeUndefined()
    expect(ends[0]?.at).toEqual({ x: 10, y: 20 })
  })

  it('re-attaches an end to a different object', () => {
    const at = middleOf(c)
    const patch = h.registry.retargetEndpoint(object(), h.store.getDocument(), 'to', {
      kind: 'object',
      objectId: c,
      ...at,
      tolerance: REACH,
    })
    expect(patch).not.toBeNull()
    if (patch === null) return

    const result = h.dispatcher.dispatch({ kind: 'UpdateObjectData', id: connector, patch })
    expect(result.ok).toBe(true)
    expect(connectorData(h, connector).to).toEqual({
      kind: 'object',
      objectId: c,
      anchor: { kind: 'auto' },
    })
  })

  /**
   * The aim you took is kept. This used to be discarded: every drop on an
   * object produced `auto`, whatever the pointer was over, so a line dragged
   * deliberately to the left edge of something could come back entering from
   * the right the moment anything moved.
   */
  it('pins the side an end was dropped on', () => {
    const patch = h.registry.retargetEndpoint(object(), h.store.getDocument(), 'to', {
      kind: 'object',
      objectId: c,
      ...anchorOf(c, 'left'),
      tolerance: REACH,
    })
    if (patch === null) throw new Error('expected a patch')
    h.dispatcher.dispatch({ kind: 'UpdateObjectData', id: connector, patch })
    expect(connectorData(h, connector).to).toEqual({
      kind: 'object',
      objectId: c,
      anchor: { kind: 'side', side: 'left' },
    })
  })

  it.each(['top', 'right', 'bottom', 'left'] as const)(
    'pins the %s anchor, not whichever side is nearest the other end',
    (side) => {
      const patch = h.registry.retargetEndpoint(object(), h.store.getDocument(), 'to', {
        kind: 'object',
        objectId: c,
        ...anchorOf(c, side),
        tolerance: REACH,
      })
      if (patch === null) throw new Error('expected a patch')
      h.dispatcher.dispatch({ kind: 'UpdateObjectData', id: connector, patch })
      expect(connectorData(h, connector).to).toEqual({
        kind: 'object',
        objectId: c,
        anchor: { kind: 'side', side },
      })
    },
  )

  /**
   * And a drop that aimed at nothing still means "join this", which is the
   * behaviour worth keeping: `auto` re-picks the facing side as things move.
   */
  it('leaves a drop on the face of an object on auto', () => {
    const patch = h.registry.retargetEndpoint(object(), h.store.getDocument(), 'to', {
      kind: 'object',
      objectId: c,
      ...middleOf(c),
      tolerance: REACH,
    })
    if (patch === null) throw new Error('expected a patch')
    h.dispatcher.dispatch({ kind: 'UpdateObjectData', id: connector, patch })
    expect(connectorData(h, connector).to).toEqual({
      kind: 'object',
      objectId: c,
      anchor: { kind: 'auto' },
    })
  })

  /**
   * A pointer is no more precise at 25% than it is at 400%, but a world unit
   * is sixteen times as far — so the tolerance travels with the drop rather
   * than being a constant here. With none of it, aiming stops working the
   * moment the board is zoomed out.
   */
  it('takes how close counts from the drop, not from a constant', () => {
    const found = h.store.getObject(c)
    if (found === undefined) throw new Error('object went missing')
    /*
     * A drop FURTHER out than the reach at 100% — the same few pixels on
     * screen, seen from four times as far out. Inside the cap the object puts
     * on its own anchors, so the only thing that can pin it is the tolerance
     * that travelled with the drop.
     */
    const offset = (Math.min(found.frame.width, found.frame.height) / 3) * 0.9
    expect(offset, 'the fixture cannot tell the two apart').toBeGreaterThan(REACH)

    const at = anchorOf(c, 'left')
    const zoomedOut = h.registry.retargetEndpoint(object(), h.store.getDocument(), 'to', {
      kind: 'object',
      objectId: c,
      x: at.x + offset,
      y: at.y,
      tolerance: REACH * 4,
    })
    if (zoomedOut === null) throw new Error('expected a patch')
    h.dispatcher.dispatch({ kind: 'UpdateObjectData', id: connector, patch: zoomedOut })
    expect(connectorData(h, connector).to).toEqual({
      kind: 'object',
      objectId: c,
      anchor: { kind: 'side', side: 'left' },
    })
  })

  it('detaches an end dropped on empty space', () => {
    const patch = h.registry.retargetEndpoint(object(), h.store.getDocument(), 'from', { kind: 'point', x: -40, y: -60 })
    if (patch === null) throw new Error('expected a patch')

    h.dispatcher.dispatch({ kind: 'UpdateObjectData', id: connector, patch })
    expect(connectorData(h, connector).from).toEqual({ kind: 'point', x: -40, y: -60 })
  })

  it('leaves the other end untouched', () => {
    const patch = h.registry.retargetEndpoint(object(), h.store.getDocument(), 'from', { kind: 'point', x: 5, y: 5 })
    if (patch === null) throw new Error('expected a patch')

    h.dispatcher.dispatch({ kind: 'UpdateObjectData', id: connector, patch })
    expect(connectorData(h, connector).to).toEqual({
      kind: 'object',
      objectId: b,
      anchor: { kind: 'auto' },
    })
  })

  /** Resolving that endpoint would need the bounds it is in the middle of computing. */
  it('refuses to attach a connector to itself', () => {
    const patch = h.registry.retargetEndpoint(object(), h.store.getDocument(), 'to', {
      kind: 'object',
      objectId: connector,
      x: 0,
      y: 0,
      tolerance: REACH,
    })
    expect(patch).toEqual({})
  })

  it('ignores an endpoint id it does not have', () => {
    expect(h.registry.retargetEndpoint(object(), h.store.getDocument(), 'middle', { kind: 'point', x: 0, y: 0 })).toEqual(
      {},
    )
  })

  it('re-attaching is undoable like any other edit', () => {
    const at = middleOf(c)
    const patch = h.registry.retargetEndpoint(object(), h.store.getDocument(), 'to', {
      kind: 'object',
      objectId: c,
      ...at,
      tolerance: REACH,
    })
    if (patch === null) throw new Error('expected a patch')
    h.dispatcher.dispatch({ kind: 'UpdateObjectData', id: connector, patch })

    h.dispatcher.undo()
    expect(connectorData(h, connector).to).toEqual({
      kind: 'object',
      objectId: b,
      anchor: { kind: 'auto' },
    })
  })

  /** Every other type has no ends, which is what keeps the overlay type-agnostic. */
  it('reports no endpoints for an ordinary object', () => {
    const sticky = h.store.getObject(a)
    if (sticky === undefined) throw new Error('missing')
    expect(h.registry.endpointsOf(sticky, h.store.getDocument())).toEqual([])
    expect(
      h.registry.retargetEndpoint(sticky, h.store.getDocument(), 'from', {
        kind: 'point',
        x: 0,
        y: 0,
      }),
    ).toBeNull()
  })
})

/**
 * Clicking the line you can SEE.
 *
 * Hit testing measured the distance to the straight line between the two ends,
 * which for anything but `straight` routing is nowhere the connector goes. An
 * orthogonal route's corner sits half the run away from that diagonal, so the
 * part of the line most obviously there to click on selected nothing at all.
 */
describe('hit testing follows the drawn route', () => {
  const routed = (routing: 'straight' | 'orthogonal' | 'curved') => {
    const h = createTestHarness()
    const connector = create(h, 'connector', 0, 0, {
      from: { kind: 'point', x: 0, y: 0 },
      to: { kind: 'point', x: 400, y: 200 },
      routing,
    })
    const object = h.store.getObject(connector)
    if (object === undefined) throw new Error('missing connector')
    return { h, object }
  }

  it('hits the corner of an orthogonal route', () => {
    const { h, object } = routed('orthogonal')
    // The route runs (0,0) → (200,0) → (200,200) → (400,200). The corner at
    // (200,0) is 89 units from the diagonal, which the old test would miss.
    expect(h.registry.hitTestObject(object, h.store.getDocument(), { x: 200, y: 2 })).toBe(true)
  })

  it('does NOT hit the diagonal an orthogonal route never travels', () => {
    const { h, object } = routed('orthogonal')
    // Dead centre of the bounding box, and nowhere near the drawn line — this
    // is the space between the two runs, which must stay clickable-through.
    expect(h.registry.hitTestObject(object, h.store.getDocument(), { x: 100, y: 100 })).toBe(false)
  })

  it('still hits a straight route along its line', () => {
    const { h, object } = routed('straight')
    expect(h.registry.hitTestObject(object, h.store.getDocument(), { x: 200, y: 100 })).toBe(true)
  })

  it('hits a curve where the curve actually is', () => {
    const { h, object } = routed('curved')
    // A curve leaves horizontally, so just past the start it is still near
    // y = 0 rather than on the diagonal's y = 25.
    expect(h.registry.hitTestObject(object, h.store.getDocument(), { x: 50, y: 4 })).toBe(true)
  })
})

describe('a bend', () => {
  const bent = (bend: { along: number; across: number } | null) => {
    const h = createTestHarness()
    const connector = create(h, 'connector', 0, 0, {
      from: { kind: 'point', x: 0, y: 0 },
      to: { kind: 'point', x: 400, y: 200 },
      routing: 'orthogonal',
      ...(bend === null ? {} : { bend }),
    })
    const object = h.store.getObject(connector)
    if (object === undefined) throw new Error('missing connector')
    return { h, object }
  }

  it('offers a handle on a route that can bend, and none on one that cannot', () => {
    const { h, object } = bent(null)
    const ids = h.registry.endpointsOf(object, h.store.getDocument()).map((point) => point.id)
    expect(ids).toEqual(['from', 'to', 'bend'])

    const straight = createTestHarness()
    const id = create(straight, 'connector', 0, 0, {
      from: { kind: 'point', x: 0, y: 0 },
      to: { kind: 'point', x: 100, y: 0 },
      routing: 'straight',
    })
    const line = straight.store.getObject(id)
    if (line === undefined) throw new Error('missing')
    expect(
      straight.registry.endpointsOf(line, straight.store.getDocument()).map((p) => p.id),
    ).toEqual(['from', 'to'])
  })

  it('moves the drawn line, and the bounds with it', () => {
    const { h, object } = bent({ along: 0.1, across: 0 })
    const bounds = h.registry.boundsOf(object, h.store.getDocument())
    // The elbow is now at x = 40, and the route still spans both ends.
    expect(h.registry.hitTestObject(object, h.store.getDocument(), { x: 40, y: 100 })).toBe(true)
    expect(h.registry.hitTestObject(object, h.store.getDocument(), { x: 200, y: 100 })).toBe(false)
    expect(bounds.width).toBeGreaterThanOrEqual(400)
  })

  /*
   * A bend that leaves the rectangle the two ends describe. Bounds taken from
   * the endpoints alone would cull this while it was still on screen, and a
   * marquee dragged over the visible line would miss it.
   */
  it('grows the bounds past the endpoints when bent outside them', () => {
    const h = createTestHarness()
    const id = create(h, 'connector', 0, 0, {
      from: { kind: 'point', x: 0, y: 0 },
      to: { kind: 'point', x: 400, y: 0 },
      routing: 'curved',
      bend: { along: 0.5, across: 300 },
    })
    const object = h.store.getObject(id)
    if (object === undefined) throw new Error('missing')
    const bounds = h.registry.boundsOf(object, h.store.getDocument())
    expect(bounds.height).toBeGreaterThan(100)
  })
})
