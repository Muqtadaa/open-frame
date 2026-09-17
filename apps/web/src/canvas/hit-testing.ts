import {
  contains,
  containsPoint,
  containsRotatedPoint,
  objectsInPaintOrder,
  type BoardDocument,
  type ObjectId,
  type ObjectTypeRegistry,
  type Point,
  type Rect,
} from '@openframe/core'

/**
 * Hit testing runs in WORLD coordinates, never by reading DOM rectangles.
 *
 * Asking the browser where an element ended up would couple selection to the
 * renderer's implementation — and would break the moment the object layer moves
 * to Canvas2D, where there are no elements to ask. Geometry answers instead.
 */
export function hitTest(
  doc: BoardDocument,
  registry: ObjectTypeRegistry,
  worldPoint: Point,
): ObjectId | null {
  const painted = objectsInPaintOrder(doc)
  // Reverse paint order: the object drawn last is the one on top.
  for (let i = painted.length - 1; i >= 0; i--) {
    const object = painted[i]
    if (object === undefined || object.hidden) continue
    // Cheap axis-aligned reject first, then the precise oriented test — the
    // rotated bounds are a superset, so anything outside them cannot be a hit.
    if (!containsPoint(registry.boundsOf(object), worldPoint)) continue
    const { x, y, width, height, rotation } = object.frame
    if (containsRotatedPoint({ x, y, width, height }, rotation, worldPoint)) return object.id
  }
  return null
}

/**
 * Marquee selection requires FULL containment, not intersection — dragging a
 * box across a crowded board should not sweep up everything it brushes.
 */
export function objectsInMarquee(
  doc: BoardDocument,
  registry: ObjectTypeRegistry,
  region: Rect,
): ObjectId[] {
  const found: ObjectId[] = []
  for (const object of objectsInPaintOrder(doc)) {
    if (object.hidden || object.locked) continue
    if (contains(region, registry.boundsOf(object))) found.push(object.id)
  }
  return found
}
