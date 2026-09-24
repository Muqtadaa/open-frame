import type { BoardDocument } from '../../domain/document.js'
import type { ObjectId } from '../../domain/ids.js'
import type { AnyOpenFrameObject } from '../../domain/object.js'
import { center, type Rect } from '../../geometry/rect.js'
import { rotatePoint, type Point } from '../../geometry/point.js'
import type { Anchor, ConnectorEndpoint } from './schema.js'

/**
 * Where each side's anchor sits, and which way is OUT of it.
 *
 * The normal is here rather than derived at use because it is the same fact:
 * a line attached to the top of something leaves upward. Everything that draws
 * a route needs it — a curve whose control points ignore it departs sideways
 * out of a bottom edge, which is what made an arrowhead point along an object
 * instead of into it.
 */
const SIDE_ANCHORS = {
  top: { u: 0.5, v: 0, nx: 0, ny: -1 },
  right: { u: 1, v: 0.5, nx: 1, ny: 0 },
  bottom: { u: 0.5, v: 1, nx: 0, ny: 1 },
  left: { u: 0, v: 0.5, nx: -1, ny: 0 },
} as const

/** A side anchor, with the direction out of it. Local to the object. */
interface Placement {
  readonly u: number
  readonly v: number
  readonly nx: number
  readonly ny: number
}

function frameRect(object: AnyOpenFrameObject): Rect {
  const { x, y, width, height } = object.frame
  return { x, y, width, height }
}

/**
 * The rectangle a connector attaches to, and how far it is turned.
 *
 * `boundsOf` is the REAL extent — a group's frame is 0x0 and its edges are its
 * children's union, so reading the frame ran a line to the group's origin,
 * which on most boards is a corner nowhere near the thing it was joined to.
 * Rule 16 names exactly this: anything that needs bounds asks the registry.
 *
 * Except when the object is TURNED. Bounds are axis-aligned, so for a rotated
 * object they describe the box AROUND the rectangle rather than where its
 * edges are — and the rotation is already baked into them, so turning them
 * again would apply it twice. A rotated object's own frame is then the honest
 * answer, and nothing both rotates and keeps its extent somewhere else: the
 * two types with derived extents, `group` and `connector`, are neither
 * rotatable nor (for the connector) connectable.
 */
function anchorRect(
  object: AnyOpenFrameObject,
  boundsOf: BoundsOf,
): { rect: Rect; rotation: number } {
  return object.frame.rotation === 0
    ? { rect: boundsOf(object), rotation: 0 }
    : { rect: frameRect(object), rotation: object.frame.rotation }
}

/** How a caller reports another object's real extent. See `anchorRect`. */
export type BoundsOf = (object: AnyOpenFrameObject) => Rect

/** A normalised (u, v) position on an object's extent, in world coordinates. */
function pointOnFrame(
  object: AnyOpenFrameObject,
  u: number,
  v: number,
  boundsOf: BoundsOf,
): Point {
  const { rect, rotation } = anchorRect(object, boundsOf)
  const local = { x: rect.x + rect.width * u, y: rect.y + rect.height * v }
  // Rotation is applied last so an anchor stays on the same visual edge when
  // the target turns.
  return rotatePoint(local, center(rect), rotation)
}

/**
 * Picks the side facing `towards`.
 *
 * Compared in the target's LOCAL space so the choice stays correct when the
 * object is rotated — otherwise `auto` would pick a visually wrong edge.
 */
function autoAnchor(object: AnyOpenFrameObject, towards: Point, boundsOf: BoundsOf): Placement {
  const { rect, rotation } = anchorRect(object, boundsOf)
  const middle = center(rect)
  const local = rotatePoint(towards, middle, -rotation)
  const dx = (local.x - middle.x) / Math.max(1, rect.width / 2)
  const dy = (local.y - middle.y) / Math.max(1, rect.height / 2)
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? SIDE_ANCHORS.right : SIDE_ANCHORS.left
  return dy >= 0 ? SIDE_ANCHORS.bottom : SIDE_ANCHORS.top
}

/**
 * Where a connector dropped HERE should attach.
 *
 * The side you aimed at if you aimed at one, and `auto` otherwise. Dropping on
 * an anchor is a deliberate act and is honoured for good; dropping on the face
 * of an object means "join this", and `auto` keeps that sensible by re-picking
 * the facing side whenever either object moves.
 *
 * Rule 16 puts this decision in the TYPE: the gesture reports where the
 * pointer was and how precise a pointer is at the current zoom, and what that
 * means for an attachment is decided here. It is also what the app calls when
 * a connector is first drawn, so a new line and a re-dragged end answer the
 * same question the same way.
 *
 * `reach` is in world units, because only the caller knows how large its
 * anchor targets are drawn on screen. It is then capped against the object:
 * on something smaller than the targets themselves every drop is near an edge,
 * and without the cap a small note could never be joined with `auto` at all.
 */
export function attachmentAnchor(
  object: AnyOpenFrameObject,
  at: Point,
  reach: number,
  boundsOf: BoundsOf,
): Anchor {
  const { width, height } = anchorRect(object, boundsOf).rect
  const limit = Math.min(reach, Math.max(1, Math.min(width, height) / 3))

  let nearest: { side: 'top' | 'right' | 'bottom' | 'left'; distance: number } | null = null
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const anchor = SIDE_ANCHORS[side]
    const point = pointOnFrame(object, anchor.u, anchor.v, boundsOf)
    const distance = Math.hypot(point.x - at.x, point.y - at.y)
    if (nearest === null || distance < nearest.distance) nearest = { side, distance }
  }

  return nearest !== null && nearest.distance <= limit
    ? { kind: 'side', side: nearest.side }
    : { kind: 'auto' }
}

function anchorPlacement(
  object: AnyOpenFrameObject,
  anchor: Anchor,
  towards: Point,
  boundsOf: BoundsOf,
): Placement {
  switch (anchor.kind) {
    case 'side':
      return SIDE_ANCHORS[anchor.side]
    /*
     * A point somewhere on the face has no side of its own, so the direction
     * out of it is the one out of the EDGE it is nearest — worked out by the
     * same comparison `auto` uses, applied to the anchor rather than to the
     * other end. A point at the exact centre has no outward direction at all
     * and is reported as such rather than guessed at.
     */
    case 'relative':
      return { u: anchor.u, v: anchor.v, ...outwardAt(object, anchor.u, anchor.v, boundsOf) }
    case 'auto':
      return autoAnchor(object, towards, boundsOf)
  }
}

/** Which edge a normalised point on the face is nearest, as a unit vector. */
function outwardAt(
  object: AnyOpenFrameObject,
  u: number,
  v: number,
  boundsOf: BoundsOf,
): { nx: number; ny: number } {
  const { width, height } = anchorRect(object, boundsOf).rect
  const dx = (u - 0.5) * Math.max(1, width)
  const dy = (v - 0.5) * Math.max(1, height)
  if (dx === 0 && dy === 0) return { nx: 0, ny: 0 }
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? { nx: 1, ny: 0 } : { nx: -1, ny: 0 }
  return dy >= 0 ? { nx: 0, ny: 1 } : { nx: 0, ny: -1 }
}

/**
 * The outward direction in WORLD space: the side's own normal, turned with the
 * object. Null when there is none to report — a free end, a dangling
 * reference, or an anchor at the exact centre of a face.
 */
function worldNormal(object: AnyOpenFrameObject, placement: Placement): Point | null {
  if (placement.nx === 0 && placement.ny === 0) return null
  return rotatePoint({ x: placement.nx, y: placement.ny }, { x: 0, y: 0 }, object.frame.rotation)
}

/** Fallback used while the other end is not yet known. */
function endpointHint(doc: BoardDocument, endpoint: ConnectorEndpoint, boundsOf: BoundsOf): Point {
  if (endpoint.kind === 'point') return { x: endpoint.x, y: endpoint.y }
  const object = doc.objects.get(endpoint.objectId)
  return object === undefined ? { x: 0, y: 0 } : center(boundsOf(object))
}

/**
 * Where a connector's ends are, and which way the line leaves each of them.
 *
 * DERIVED, never stored — which is why moving an object does not patch the
 * connectors attached to it. Each end is resolved against the other's position
 * so `auto` anchors face one another.
 *
 * The NORMALS are what make a route meet an object rather than merely reach
 * it. Without them the curve chose its control points from the run's dominant
 * axis, so a line anchored to a bottom edge left sideways and its arrowhead
 * pointed along the object instead of into it. A free end has none, and a
 * route with none behaves exactly as it always did.
 */
export interface ResolvedEnds {
  readonly start: Point
  readonly end: Point
  /** Unit vectors pointing OUT of whatever each end is attached to. */
  readonly startNormal: Point | null
  readonly endNormal: Point | null
}

export function resolveEndpoints(
  doc: BoardDocument,
  from: ConnectorEndpoint,
  to: ConnectorEndpoint,
  boundsOf: BoundsOf,
): ResolvedEnds {
  const fromHint = endpointHint(doc, from, boundsOf)
  const toHint = endpointHint(doc, to, boundsOf)

  const resolve = (
    endpoint: ConnectorEndpoint,
    towards: Point,
  ): { at: Point; normal: Point | null } => {
    if (endpoint.kind === 'point') return { at: { x: endpoint.x, y: endpoint.y }, normal: null }
    const object = doc.objects.get(endpoint.objectId)
    // A dangling reference resolves to the hint rather than throwing: a
    // half-loaded or repaired document must still render.
    if (object === undefined) return { at: towards, normal: null }
    const placement = anchorPlacement(object, endpoint.anchor, towards, boundsOf)
    return {
      at: pointOnFrame(object, placement.u, placement.v, boundsOf),
      normal: worldNormal(object, placement),
    }
  }

  const start = resolve(from, toHint)
  const end = resolve(to, fromHint)
  return {
    start: start.at,
    end: end.at,
    startNormal: start.normal,
    endNormal: end.normal,
  }
}

/** Object ids a connector's geometry depends on. */
export function endpointDependencies(from: ConnectorEndpoint, to: ConnectorEndpoint): ObjectId[] {
  const ids: ObjectId[] = []
  if (from.kind === 'object') ids.push(from.objectId)
  if (to.kind === 'object') ids.push(to.objectId)
  return ids
}
