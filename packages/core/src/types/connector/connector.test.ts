import { beforeEach, describe, expect, it } from 'vitest'

import type { ObjectId } from '../../domain/ids.js'
import type { AnyOpenFrameObject } from '../../domain/object.js'
import { createTestHarness, type TestHarness } from '../../testing.js'
import { attachmentAnchor, resolveEndpoints } from './geometry.js'
import { connectorRoute } from './route.js'
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
    // The ends first, then whatever shapes the route between them.
    expect(ends.slice(0, 2).map((e) => e.id)).toEqual(['from', 'to'])
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
      final: true,
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
      final: true,
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
        final: true,
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
      final: true,
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
      final: true,
    })
    if (zoomedOut === null) throw new Error('expected a patch')
    h.dispatcher.dispatch({ kind: 'UpdateObjectData', id: connector, patch: zoomedOut })
    expect(connectorData(h, connector).to).toEqual({
      kind: 'object',
      objectId: c,
      anchor: { kind: 'side', side: 'left' },
    })
  })

  /**
   * The L holds once it has taken.
   *
   * Read off the object's own bend rather than remembered by the gesture: the
   * canvas feeds its preview back in as the object's data on the next move, so
   * the type sees its own last answer and the caller never has to know what a
   * bend is.
   */
  describe('collapsing an orthogonal route', () => {
    let line: ObjectId

    beforeEach(() => {
      line = create(h, 'connector', 0, 0, {
        from: { kind: 'point', x: 0, y: 0 },
        to: { kind: 'point', x: 400, y: 200 },
        routing: 'orthogonal',
      })
    })

    /** The line as it currently stands, with a pending patch merged in. */
    const shaped = (patch?: unknown): AnyOpenFrameObject => {
      const held = h.store.getObject(line)
      if (held === undefined) throw new Error('the line went missing')
      return patch === undefined
        ? held
        : { ...held, data: { ...(held.data as object), ...(patch as object) } }
    }

    /**
     * The handle on the leg nearest a point, which is how a hand picks one:
     * by what it can see, not by an id. Ids move about as a route gains and
     * loses stops, and a test that named one would be testing the naming.
     */
    const legNear = (object: AnyOpenFrameObject, at: { x: number; y: number }): string => {
      const handles = h.registry
        .endpointsOf(object, h.store.getDocument())
        .filter((point) => point.id.startsWith('leg:'))
      let best: { id: string; away: number } | null = null
      for (const handle of handles) {
        const away = Math.hypot(handle.at.x - at.x, handle.at.y - at.y)
        if (best === null || away < best.away) best = { id: handle.id, away }
      }
      if (best === null) throw new Error('no legs to drag')
      return best.id
    }

    const slide = (
      object: AnyOpenFrameObject,
      grab: { x: number; y: number },
      to: { x: number; y: number },
      final = true,
    ): unknown =>
      h.registry.retargetEndpoint(object, h.store.getDocument(), legNear(object, grab), {
        kind: 'point',
        ...to,
        tolerance: 14,
        final,
      })

    /** Where the line actually runs, asked of the route rather than the data. */
    const inks = (object: AnyOpenFrameObject, at: { x: number; y: number }): boolean =>
      h.registry.hitTestObject(object, h.store.getDocument(), at)

    it('takes the L when the crossing is pushed near an end', () => {
      const before = shaped()
      // It starts out standing in the middle: that is the route it draws.
      expect(inks(before, { x: 200, y: 100 })).toBe(true)

      const after = shaped(slide(before, { x: 200, y: 100 }, { x: 6, y: 100 }))
      /*
       * Flush against the near end, so the route turns ONCE. Asserted on the
       * ink rather than on the stored fraction: what matters is where the
       * line is, and the number behind it has already changed shape twice.
       */
      expect(inks(after, { x: 0, y: 100 })).toBe(true)
      expect(inks(after, { x: 200, y: 100 })).toBe(false)
    })

    it('holds it further out than it took it, once collapsed', () => {
      const out = { x: 20, y: 100 }
      // From a route crossing the middle, twenty units is too far to snap.
      const fresh = shaped(slide(shaped(), { x: 200, y: 100 }, out))
      expect(inks(fresh, { x: 20, y: 100 })).toBe(true)
      expect(inks(fresh, { x: 0, y: 100 })).toBe(false)

      // From one already collapsed, the same drop keeps the L.
      const collapsed = shaped(slide(shaped(), { x: 200, y: 100 }, { x: 6, y: 100 }))
      const still = shaped(slide(collapsed, { x: 0, y: 100 }, out))
      expect(inks(still, { x: 0, y: 100 })).toBe(true)
    })

    it('lets go when the crossing is pulled well clear', () => {
      const collapsed = shaped(slide(shaped(), { x: 200, y: 100 }, { x: 6, y: 100 }))
      const freed = shaped(slide(collapsed, { x: 0, y: 100 }, { x: 120, y: 100 }))
      expect(inks(freed, { x: 120, y: 100 })).toBe(true)
      expect(inks(freed, { x: 0, y: 100 })).toBe(false)
    })
  })

  it('detaches an end dropped on empty space', () => {
    const patch = h.registry.retargetEndpoint(object(), h.store.getDocument(), 'from', { kind: 'point', x: -40, y: -60, tolerance: REACH, final: true })
    if (patch === null) throw new Error('expected a patch')

    h.dispatcher.dispatch({ kind: 'UpdateObjectData', id: connector, patch })
    expect(connectorData(h, connector).from).toEqual({ kind: 'point', x: -40, y: -60 })
  })

  it('leaves the other end untouched', () => {
    const patch = h.registry.retargetEndpoint(object(), h.store.getDocument(), 'from', { kind: 'point', x: 5, y: 5, tolerance: REACH, final: true })
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
      final: true,
    })
    expect(patch).toEqual({})
  })

  it('ignores an endpoint id it does not have', () => {
    expect(h.registry.retargetEndpoint(object(), h.store.getDocument(), 'middle', { kind: 'point', x: 0, y: 0, tolerance: REACH, final: true })).toEqual(
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
      final: true,
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
        tolerance: REACH,
        final: true,
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
      points: bend === null ? [] : [bend],
    })
    const object = h.store.getObject(connector)
    if (object === undefined) throw new Error('missing connector')
    return { h, object }
  }

  it('offers legs on an orthogonal route, and stops on the others', () => {
    const { h, object } = bent(null)
    const ids = h.registry.endpointsOf(object, h.store.getDocument()).map((point) => point.id)
    /*
     * Three runs, each named by what moving it CHANGES: the axis it shifts
     * along, and the stop it moves or the slot a new one goes in. None of
     * them holds a stop yet, so all three would make the route's first one —
     * which is why the id carries the leg's own place as well, or they would
     * every one of them be called the same thing.
     */
    expect(ids).toEqual(['from', 'to', 'leg:y:new:0:0', 'leg:x:new:0:1', 'leg:y:new:0:2'])

    /*
     * A straight route has no elbow — there is no middle segment to slide —
     * but it does have a stretch whose middle can be pulled into a vertex,
     * which is how a line gets its first stop.
     */
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
    ).toEqual(['from', 'to', 'midpoint:0'])
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
      points: [{ along: 0.5, across: 300 }],
    })
    const object = h.store.getObject(id)
    if (object === undefined) throw new Error('missing')
    const bounds = h.registry.boundsOf(object, h.store.getDocument())
    expect(bounds.height).toBeGreaterThan(100)
  })
})

/**
 * MANY STOPS, which is what a connector needs to get round anything.
 *
 * The route passes THROUGH each one — not near it, and not in whatever order
 * the arithmetic lands on. A stop you placed is a position you chose, and a
 * line that visits two of them backwards crosses itself in front of you.
 */
describe('a route held at several points', () => {
  const stops = (routing: 'straight' | 'curved', points: readonly { along: number; across: number }[]) => {
    const h = createTestHarness()
    const id = create(h, 'connector', 0, 0, {
      from: { kind: 'point', x: 0, y: 0 },
      to: { kind: 'point', x: 400, y: 0 },
      routing,
      points,
    })
    const object = h.store.getObject(id)
    if (object === undefined) throw new Error('missing connector')
    return { h, object, id }
  }

  /** Where a drop lands, as the drag would report it. */
  /**
   * Where a drop lands, as the drag reports it.
   *
   * `final` is what separates the release from another preview frame, and it
   * defaults to the RELEASE here because most of these ask what a completed
   * drag produces. The tests that care about the difference say so.
   */
  const drop = (x: number, y: number, final = true) =>
    ({ kind: 'point' as const, x, y, tolerance: 8, final })

  it.each(['straight', 'curved'] as const)(
    'offers one midpoint per stretch of a %s route, and a handle at each stop',
    (routing) => {
      const { h, object } = stops(routing, [{ along: 0.5, across: 60 }])
      const ids = h.registry.endpointsOf(object, h.store.getDocument()).map((point) => point.id)
      expect(ids).toEqual(['from', 'to', 'vertex:0', 'midpoint:0', 'midpoint:1'])
    },
  )

  it('puts a midpoint handle on the line it would change', () => {
    const { h, object } = stops('straight', [])
    const [midpoint] = h.registry
      .endpointsOf(object, h.store.getDocument())
      .filter((point) => point.id === 'midpoint:0')
    expect(midpoint?.at).toEqual({ x: 200, y: 0 })
    // And it names that stretch, so the overlay can show it only while the
    // pointer is on it rather than drawing a dot on every segment at once.
    expect(midpoint?.shownNear?.length).toBeGreaterThanOrEqual(2)
    // And hands the drag over to the vertex it creates, or it would create
    // one per pointer event for as long as the drag lasted.
    expect(midpoint?.becomes).toBe('vertex:0')
  })

  it('creates a stop where a midpoint was dropped', () => {
    const { h, object } = stops('straight', [])
    const patch = h.registry.retargetEndpoint(
      object,
      h.store.getDocument(),
      'midpoint:0',
      drop(200, 90),
    )
    const points = (patch as { points?: readonly { along: number; across: number }[] }).points
    expect(points).toHaveLength(1)
    const moved = { ...object, data: { ...(object.data as object), ...patch } }
    // THROUGH the drop, which is the whole promise of a stop.
    expect(h.registry.hitTestObject(moved, h.store.getDocument(), { x: 200, y: 90 })).toBe(true)
  })

  it('inserts at the stretch that was dragged, not at the end of the list', () => {
    const { h, object } = stops('straight', [{ along: 0.5, across: 0 }])
    /*
     * The FIRST stretch: between the near end and the stop that is already
     * there. Dragging the last stretch instead would prove nothing — its
     * index is the length of the list, so appending and inserting land in the
     * same place, and this test passed with the insertion deleted.
     */
    const patch = h.registry.retargetEndpoint(
      object,
      h.store.getDocument(),
      'midpoint:0',
      drop(100, 80),
    )
    const points = (patch as { points: { along: number; across: number }[] }).points
    expect(points).toHaveLength(2)
    /*
     * Order is the point. Appended instead, the route would run out to the
     * middle, back to a quarter along and out again — visibly crossing
     * itself, and the failure a length check alone cannot see.
     */
    expect(points[0]?.along).toBeCloseTo(0.25, 6)
    expect(points[1]?.along).toBeCloseTo(0.5, 6)
  })

  it('moves the stop a vertex handle names, and leaves the others alone', () => {
    const { h, object } = stops('curved', [
      { along: 0.25, across: 40 },
      { along: 0.75, across: -40 },
    ])
    const patch = h.registry.retargetEndpoint(
      object,
      h.store.getDocument(),
      'vertex:1',
      drop(300, 120),
    )
    const points = (patch as { points: { along: number; across: number }[] }).points
    expect(points).toHaveLength(2)
    expect(points[0]).toEqual({ along: 0.25, across: 40 })
    expect(points[1]?.across).toBeCloseTo(120, 6)
  })

  it('refuses a handle naming a stop that is not there', () => {
    const { h, object } = stops('straight', [])
    expect(
      h.registry.retargetEndpoint(object, h.store.getDocument(), 'vertex:0', drop(10, 10)),
    ).toEqual({})
    expect(
      h.registry.retargetEndpoint(object, h.store.getDocument(), 'midpoint:4', drop(10, 10)),
    ).toEqual({})
  })

  it('leaves an orthogonal route to its legs', () => {
    const h = createTestHarness()
    const id = create(h, 'connector', 0, 0, {
      from: { kind: 'point', x: 0, y: 0 },
      to: { kind: 'point', x: 400, y: 200 },
      routing: 'orthogonal',
    })
    const object = h.store.getObject(id)
    if (object === undefined) throw new Error('missing connector')
    const ids = h.registry.endpointsOf(object, h.store.getDocument()).map((point) => point.id)
    // Legs, not points: a staircase is pushed about by its own sides.
    expect(ids.every((id) => id === 'from' || id === 'to' || id.startsWith('leg:'))).toBe(true)
    expect(
      h.registry.retargetEndpoint(object, h.store.getDocument(), 'midpoint:0', drop(10, 10)),
    ).toEqual({})
  })

  it('grows the bounds and the hit area around every stop', () => {
    const { h, object } = stops('straight', [
      { along: 0.25, across: 200 },
      { along: 0.75, across: -200 },
    ])
    const bounds = h.registry.boundsOf(object, h.store.getDocument())
    expect(bounds.height).toBeGreaterThanOrEqual(400)
    expect(h.registry.hitTestObject(object, h.store.getDocument(), { x: 100, y: 200 })).toBe(true)
    /*
     * And still NOT the straight line between the ends, which the route no
     * longer travels. A quarter of the way along it, where the drawn route is
     * a hundred units above — the exact middle is no good as a check, because
     * a zigzag through two opposite stops crosses the straight line there.
     */
    expect(h.registry.hitTestObject(object, h.store.getDocument(), { x: 50, y: 0 })).toBe(false)
  })
})

/**
 * TAKING A STOP OFF AGAIN, which a line needs as much as putting one on.
 *
 * Dragged onto the stop or the end next to it, a stop is swallowed: the route
 * stops pinning there, so what is drawn is already what letting go commits.
 * It only leaves the LIST on release, because a list that got shorter
 * mid-drag would shift every index after it and the hand would carry on
 * moving a different point.
 */
describe('dissolving a stop into its neighbour', () => {
  const held = (points: readonly { along: number; across: number }[]) => {
    const h = createTestHarness()
    const id = create(h, 'connector', 0, 0, {
      from: { kind: 'point', x: 0, y: 0 },
      to: { kind: 'point', x: 400, y: 0 },
      routing: 'straight',
      points,
    })
    const object = h.store.getObject(id)
    if (object === undefined) throw new Error('missing connector')
    return { h, object }
  }

  const moved = (object: AnyOpenFrameObject, patch: object): AnyOpenFrameObject => ({
    ...object,
    data: { ...(object.data as object), ...patch },
  })

  const stopsOf = (patch: unknown): readonly { along: number; across: number }[] =>
    (patch as { points: { along: number; across: number }[] }).points

  /** Where a stop is dropped, in world units, and how close counts. */
  const at = (x: number, y: number, final = false) =>
    ({ kind: 'point' as const, x, y, tolerance: 14, final })

  it('merges a stop dropped on the end next to it, without shortening the list', () => {
    const { h, object } = held([{ along: 0.5, across: 80 }])
    // The start is at x = 0; eight units away is well inside the tolerance.
    const patch = h.registry.retargetEndpoint(object, h.store.getDocument(), 'vertex:0', at(8, 0))
    /*
     * STILL ONE POINT. Removing it here is what would shift the indices under
     * a drag that has not finished.
     */
    expect(stopsOf(patch)).toHaveLength(1)
    // And it sits exactly on the end, not eight units off it.
    expect(stopsOf(patch)[0]).toEqual({ along: 0, across: 0 })
  })

  it('draws the route as though it were already gone', () => {
    /*
     * A CURVE, deliberately. On a straight route a stop sitting exactly on
     * its neighbour makes a zero-length segment and the drawn line is the
     * same either way — so a straight route cannot tell whether the route
     * stopped pinning there, and this test passed with that rule deleted. A
     * curve can: it takes its tangents from the nodes, and one it passes
     * through twice kinks at the very place the line should be smoothest.
     */
    const h = createTestHarness()
    const curved = (points: readonly { along: number; across: number }[]): AnyOpenFrameObject => {
      const id = create(h, 'connector', 0, 0, {
        from: { kind: 'point', x: 0, y: 0 },
        to: { kind: 'point', x: 400, y: 0 },
        routing: 'curved',
        points,
      })
      const made = h.store.getObject(id)
      if (made === undefined) throw new Error('missing connector')
      return made
    }

    const bent = curved([{ along: 0.5, across: 80 }])
    const patch = h.registry.retargetEndpoint(bent, h.store.getDocument(), 'vertex:0', at(8, 0))
    const preview = moved(bent, patch as object)

    /*
     * What is drawn IS what the release commits: the same curve as one that
     * was never given a stop at all. A preview that showed the stop still in
     * place would jump the moment the pointer came up.
     */
    const plain = curved([])
    expect(h.registry.boundsOf(preview, h.store.getDocument())).toEqual(
      h.registry.boundsOf(plain, h.store.getDocument()),
    )
    expect(h.registry.hitTestObject(preview, h.store.getDocument(), { x: 200, y: 0 })).toBe(true)
  })

  it('takes it out of the list on release, and only then', () => {
    const { h, object } = held([{ along: 0.5, across: 80 }])
    const preview = h.registry.retargetEndpoint(object, h.store.getDocument(), 'vertex:0', at(8, 0))
    expect(stopsOf(preview)).toHaveLength(1)

    const released = h.registry.retargetEndpoint(
      moved(object, preview as object),
      h.store.getDocument(),
      'vertex:0',
      at(8, 0, true),
    )
    expect(stopsOf(released)).toHaveLength(0)
  })

  it('leaves the stop where it was put when no neighbour is near', () => {
    const { h, object } = held([{ along: 0.5, across: 80 }])
    const patch = h.registry.retargetEndpoint(
      object,
      h.store.getDocument(),
      'vertex:0',
      at(200, 40, true),
    )
    expect(stopsOf(patch)).toHaveLength(1)
    expect(stopsOf(patch)[0]?.across).toBeCloseTo(40, 6)
  })

  it('holds the merge further out than it took it', () => {
    const { h, object } = held([{ along: 0.5, across: 80 }])
    // Twenty units out: past the tolerance that would catch it...
    const fresh = h.registry.retargetEndpoint(object, h.store.getDocument(), 'vertex:0', at(20, 0))
    expect(stopsOf(fresh)[0]?.along).not.toBe(0)

    // ...and not enough to let go of it once it has taken, so the line does
    // not flicker while a hand hovers at the threshold.
    const merged = moved(object, { points: [{ along: 0, across: 0 }] })
    const still = h.registry.retargetEndpoint(merged, h.store.getDocument(), 'vertex:0', at(20, 0))
    expect(stopsOf(still)[0]).toEqual({ along: 0, across: 0 })

    // Pulled properly clear, it comes back.
    const away = h.registry.retargetEndpoint(merged, h.store.getDocument(), 'vertex:0', at(90, 60))
    expect(stopsOf(away)[0]?.across).toBeCloseTo(60, 6)
  })

  it('merges into the stop next to it, not only into an end', () => {
    const { h, object } = held([
      { along: 0.25, across: 60 },
      { along: 0.75, across: -60 },
    ])
    // The first stop is at (100, 60); dropping the second within reach of it.
    const patch = h.registry.retargetEndpoint(
      object,
      h.store.getDocument(),
      'vertex:1',
      at(106, 60),
    )
    expect(stopsOf(patch)[1]).toEqual({ along: 0.25, across: 60 })

    const released = h.registry.retargetEndpoint(
      moved(object, patch as object),
      h.store.getDocument(),
      'vertex:1',
      at(106, 60, true),
    )
    // The one that was dragged is the one that goes.
    expect(stopsOf(released)).toEqual([{ along: 0.25, across: 60 }])
  })

  it('lets the END win the tie, so the last place pinned is the thing it joins', () => {
    const { h, object } = held([{ along: 0.5, across: 80 }])
    const patch = h.registry.retargetEndpoint(
      object,
      h.store.getDocument(),
      'vertex:0',
      at(396, 0),
    )
    const preview = moved(object, patch as object)
    const route = h.registry.boundsOf(preview, h.store.getDocument())
    // The stop is on top of the far end, and the route still reaches it.
    expect(route.x + route.width).toBeGreaterThanOrEqual(400)
    expect(h.registry.hitTestObject(preview, h.store.getDocument(), { x: 399, y: 0 })).toBe(true)

    /*
     * And the stretch that remains offers to insert AFTER that stop rather
     * than to move it. Geometry alone cannot see this — the two nodes are at
     * the same coordinates, so dropping either draws the same line — but
     * which one survives decides what the handles mean, and keeping the stop
     * would turn "add a point here" into "drag the one you just merged".
     */
    const ids = h.registry
      .endpointsOf(preview, h.store.getDocument())
      .map((point) => point.id)
    expect(ids).toEqual(['from', 'to', 'vertex:0', 'midpoint:1'])
  })

  it('keeps the handles naming the right places while one is swallowed', () => {
    const { h, object } = held([
      { along: 0.25, across: 60 },
      { along: 0.75, across: -60 },
    ])
    const patch = h.registry.retargetEndpoint(
      object,
      h.store.getDocument(),
      'vertex:1',
      at(106, 60),
    )
    const ids = h.registry
      .endpointsOf(moved(object, patch as object), h.store.getDocument())
      .map((point) => point.id)
    /*
     * BOTH stops still have a handle, because both are still in the list —
     * and the midpoints name where in that list a new one would go rather
     * than which stretch they sit on. With one stop swallowed the route pins
     * one place fewer than the list holds, so an ordinal would name the wrong
     * slot: there is no `midpoint:1` here, because no drawn stretch ends at
     * the stop that is currently merged.
     */
    expect(ids).toEqual(['from', 'to', 'vertex:0', 'vertex:1', 'midpoint:0', 'midpoint:2'])
  })
})

/**
 * A STAIRCASE, which is what an orthogonal route becomes once it is pushed
 * about. Each run is dragged by its own side, and the runs either side stretch
 * to stay square.
 */
describe('pushing an orthogonal route about by its legs', () => {
  const squared = (points: readonly { along: number; across: number }[] = []) => {
    const h = createTestHarness()
    const id = create(h, 'connector', 0, 0, {
      from: { kind: 'point', x: 0, y: 0 },
      to: { kind: 'point', x: 400, y: 200 },
      routing: 'orthogonal',
      points,
    })
    const object = h.store.getObject(id)
    if (object === undefined) throw new Error('missing connector')
    return { h, object }
  }

  const merged = (object: AnyOpenFrameObject, patch: unknown): AnyOpenFrameObject => ({
    ...object,
    data: { ...(object.data as object), ...(patch as object) },
  })

  const stopsOf = (object: AnyOpenFrameObject): readonly unknown[] =>
    (object.data as { points: readonly unknown[] }).points

  const slide = (
    h: TestHarness,
    object: AnyOpenFrameObject,
    id: string,
    to: { x: number; y: number },
    final = false,
  ): unknown =>
    h.registry.retargetEndpoint(object, h.store.getDocument(), id, {
      kind: 'point',
      ...to,
      tolerance: 14,
      final,
    })

  it('names every leg by what moving it would change', () => {
    const { h, object } = squared()
    const ids = h.registry
      .endpointsOf(object, h.store.getDocument())
      .filter((point) => point.id.startsWith('leg:'))
    /*
     * The axis it shifts along, then the stop it moves or the slot a new one
     * goes in. An ordinal alone would mean something different the moment a
     * drag inserted a stop — and the rest of that drag would be sliding a
     * different run.
     */
    expect(ids.map((point) => point.id)).toEqual([
      'leg:y:new:0:0',
      'leg:x:new:0:1',
      'leg:y:new:0:2',
    ])
    // Each hands over to the leg that moves the stop it just made.
    expect(ids.map((point) => point.becomes)).toEqual([
      'leg:y:stop:0',
      'leg:x:stop:0',
      'leg:y:stop:0',
    ])
    // And each is grabbed ALONG its run, not at a point on it.
    expect(ids.every((point) => point.grip !== undefined)).toBe(true)
  })

  it('gives every handle its own name, however many legs there are', () => {
    const { h, object } = squared([
      { along: 0.3, across: 60 },
      { along: 0.6, across: -60 },
    ])
    const ids = h.registry.endpointsOf(object, h.store.getDocument()).map((point) => point.id)
    // React keys and the gesture's own lookup both need this, and three legs
    // of an untouched route would otherwise all be called the same thing.
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('moves the run that was grabbed, and stretches the ones either side', () => {
    const { h, object } = squared()
    const pushed = merged(object, slide(h, object, 'leg:x:new:0:1', { x: 120, y: 100 }))
    // The crossing is where it was put, and the route still reaches both ends.
    expect(h.registry.hitTestObject(pushed, h.store.getDocument(), { x: 120, y: 100 })).toBe(true)
    expect(h.registry.hitTestObject(pushed, h.store.getDocument(), { x: 60, y: 0 })).toBe(true)
    expect(h.registry.hitTestObject(pushed, h.store.getDocument(), { x: 300, y: 200 })).toBe(true)

  })

  it('gains no turn from a run being slid, on any geometry', () => {
    /*
     * Sliding a run is not adding a corner to the route: the stop the drag
     * makes carries the coordinate it is NOT being dragged along, so the leg
     * before it collapses to nothing and goes.
     *
     * Several shapes, because a stop is stored as a fraction along the run and
     * an offset across it — and whether that round trip lands exactly back on
     * the line depends on the numbers. On (400, 200) it does, and this test
     * passed with the tolerance that makes it work deleted; on (300, 100) it
     * comes home a ten-thousandth of a millionth out, and the corner that
     * leaves behind is invisible to a hit test but plainly there in the path.
     */
    for (const corner of [
      { x: 400, y: 200 },
      { x: 373, y: 241 },
      { x: 300, y: 100 },
    ]) {
      const h = createTestHarness()
      const id = create(h, 'connector', 0, 0, {
        from: { kind: 'point', x: 0, y: 0 },
        to: { kind: 'point', ...corner },
        routing: 'orthogonal',
      })
      const object = h.store.getObject(id)
      if (object === undefined) throw new Error('missing connector')

      const drawn = (on: AnyOpenFrameObject): number =>
        connectorRoute(
          { x: 0, y: 0 },
          corner,
          'orthogonal',
          (on.data as { points: readonly { along: number; across: number }[] }).points,
        ).points.length

      const pushed = merged(
        object,
        slide(h, object, legNear(h, object, { x: corner.x / 2, y: corner.y / 2 }), {
          x: corner.x / 3,
          y: corner.y / 2,
        }),
      )
      expect(drawn(pushed), `a turn appeared on (${String(corner.x)}, ${String(corner.y)})`).toBe(
        drawn(object),
      )
    }
  })

  /**
   * The handle on the leg nearest a point, which is how a hand picks one: by
   * what it can see. Ids move about as a route gains stops, and a test that
   * named them would be testing the naming.
   */
  const legNear = (
    h: TestHarness,
    object: AnyOpenFrameObject,
    at: { x: number; y: number },
  ): string => {
    let best: { id: string; away: number } | null = null
    for (const handle of h.registry.endpointsOf(object, h.store.getDocument())) {
      if (!handle.id.startsWith('leg:')) continue
      const away = Math.hypot(handle.at.x - at.x, handle.at.y - at.y)
      if (best === null || away < best.away) best = { id: handle.id, away }
    }
    if (best === null) throw new Error('no legs to drag')
    return best.id
  }

  it('builds a staircase, one leg at a time', () => {
    const { h, object } = squared()
    const inks = (on: AnyOpenFrameObject, at: { x: number; y: number }): boolean =>
      h.registry.hitTestObject(on, h.store.getDocument(), at)

    // The crossing first, which puts the route's first stop in the list.
    const first = merged(object, slide(h, object, legNear(h, object, { x: 200, y: 100 }), { x: 120, y: 100 }))
    expect(stopsOf(first)).toHaveLength(1)
    expect(inks(first, { x: 120, y: 100 })).toBe(true)

    // Then the run leaving the start, which that stop now holds: it moves,
    // and a new corner appears between it and the end it leaves.
    const second = merged(first, slide(h, first, legNear(h, first, { x: 60, y: 0 }), { x: 60, y: 70 }))
    expect(inks(second, { x: 60, y: 70 })).toBe(true)
    expect(inks(second, { x: 0, y: 35 })).toBe(true)

    /*
     * And that new corner's own run, which is held by the START — so there is
     * nowhere to write to until a stop goes in beside it. That is the second
     * one, and the route is a staircase.
     */
    const third = merged(second, slide(h, second, legNear(h, second, { x: 0, y: 35 }), { x: 40, y: 35 }))
    expect(stopsOf(third)).toHaveLength(2)
    expect(inks(third, { x: 40, y: 35 })).toBe(true)
    expect(inks(third, { x: 60, y: 70 })).toBe(true)
    expect(inks(third, { x: 120, y: 150 })).toBe(true)
  })

  it('drops a stop the line no longer turns at, on release', () => {
    const { h, object } = squared()
    const bent = merged(object, slide(h, object, 'leg:x:new:0:1', { x: 120, y: 100 }))
    expect(stopsOf(bent)).toHaveLength(1)

    /*
     * Pushed back to where the route would have gone anyway. While the drag
     * is live the stop stays — the indices must not move under a hand — and
     * the release drops it, or it would resurrect the jog the moment either
     * object moved, since what it holds is relative to the run.
     */
    const flat = merged(bent, slide(h, bent, 'leg:x:stop:0', { x: 200, y: 100 }))
    expect(stopsOf(flat)).toHaveLength(1)

    const let_go = merged(bent, slide(h, bent, 'leg:x:stop:0', { x: 200, y: 100 }, true))
    expect(stopsOf(let_go)).toHaveLength(0)
    // And the route is the one it draws with nothing stored at all.
    expect(h.registry.hitTestObject(let_go, h.store.getDocument(), { x: 200, y: 100 })).toBe(true)
  })

  it('refuses a leg handle on a route that has no legs', () => {
    const h = createTestHarness()
    const id = create(h, 'connector', 0, 0, {
      from: { kind: 'point', x: 0, y: 0 },
      to: { kind: 'point', x: 400, y: 200 },
      routing: 'curved',
    })
    const object = h.store.getObject(id)
    if (object === undefined) throw new Error('missing connector')
    expect(
      slide(h, object, 'leg:x:new:0:1', { x: 100, y: 100 }),
    ).toEqual({})
  })
})
