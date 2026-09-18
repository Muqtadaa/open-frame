import type { BoardDocument } from '../../domain/document.js'
import type { ObjectId } from '../../domain/ids.js'
import type { AnyOpenFrameObject } from '../../domain/object.js'
import { center, type Rect } from '../../geometry/rect.js'
import { rotatePoint, type Point } from '../../geometry/point.js'
import type { Anchor, ConnectorEndpoint } from './schema.js'

const SIDE_ANCHORS = {
  top: { u: 0.5, v: 0 },
  right: { u: 1, v: 0.5 },
  bottom: { u: 0.5, v: 1 },
  left: { u: 0, v: 0.5 },
} as const

function frameRect(object: AnyOpenFrameObject): Rect {
  const { x, y, width, height } = object.frame
  return { x, y, width, height }
}

/** A normalised (u, v) position on an object's frame, in world coordinates. */
function pointOnFrame(object: AnyOpenFrameObject, u: number, v: number): Point {
  const rect = frameRect(object)
  const local = { x: rect.x + rect.width * u, y: rect.y + rect.height * v }
  // Rotation is applied last so an anchor stays on the same visual edge when
  // the target turns.
  return rotatePoint(local, center(rect), object.frame.rotation)
}

/**
 * Picks the side facing `towards`.
 *
 * Compared in the target's LOCAL space so the choice stays correct when the
 * object is rotated — otherwise `auto` would pick a visually wrong edge.
 */
function autoAnchor(object: AnyOpenFrameObject, towards: Point): { u: number; v: number } {
  const rect = frameRect(object)
  const middle = center(rect)
  const local = rotatePoint(towards, middle, -object.frame.rotation)
  const dx = (local.x - middle.x) / Math.max(1, rect.width / 2)
  const dy = (local.y - middle.y) / Math.max(1, rect.height / 2)
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? SIDE_ANCHORS.right : SIDE_ANCHORS.left
  return dy >= 0 ? SIDE_ANCHORS.bottom : SIDE_ANCHORS.top
}

function anchorUV(
  object: AnyOpenFrameObject,
  anchor: Anchor,
  towards: Point,
): { u: number; v: number } {
  switch (anchor.kind) {
    case 'side':
      return SIDE_ANCHORS[anchor.side]
    case 'relative':
      return { u: anchor.u, v: anchor.v }
    case 'auto':
      return autoAnchor(object, towards)
  }
}

/** Fallback used while the other end is not yet known. */
function endpointHint(doc: BoardDocument, endpoint: ConnectorEndpoint): Point {
  if (endpoint.kind === 'point') return { x: endpoint.x, y: endpoint.y }
  const object = doc.objects.get(endpoint.objectId)
  return object === undefined ? { x: 0, y: 0 } : center(frameRect(object))
}

/**
 * Where a connector's ends actually are.
 *
 * DERIVED, never stored — which is why moving an object does not patch the
 * connectors attached to it. Each end is resolved against the other's position
 * so `auto` anchors face one another.
 */
export function resolveEndpoints(
  doc: BoardDocument,
  from: ConnectorEndpoint,
  to: ConnectorEndpoint,
): { readonly start: Point; readonly end: Point } {
  const fromHint = endpointHint(doc, from)
  const toHint = endpointHint(doc, to)

  const resolve = (endpoint: ConnectorEndpoint, towards: Point): Point => {
    if (endpoint.kind === 'point') return { x: endpoint.x, y: endpoint.y }
    const object = doc.objects.get(endpoint.objectId)
    // A dangling reference resolves to the hint rather than throwing: a
    // half-loaded or repaired document must still render.
    if (object === undefined) return towards
    const { u, v } = anchorUV(object, endpoint.anchor, towards)
    return pointOnFrame(object, u, v)
  }

  return { start: resolve(from, toHint), end: resolve(to, fromHint) }
}

/** Object ids a connector's geometry depends on. */
export function endpointDependencies(from: ConnectorEndpoint, to: ConnectorEndpoint): ObjectId[] {
  const ids: ObjectId[] = []
  if (from.kind === 'object') ids.push(from.objectId)
  if (to.kind === 'object') ids.push(to.objectId)
  return ids
}
