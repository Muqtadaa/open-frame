import {
  contains,
  containsPoint,
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
    // Cheap axis-aligned reject first, then the precise test — bounds are a
    // superset, so anything outside them cannot be a hit.
    if (!containsPoint(registry.boundsOf(object, doc), worldPoint)) continue
    if (registry.hitTestObject(object, doc, worldPoint)) return object.id
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
    if (contains(region, registry.boundsOf(object, doc))) found.push(object.id)
  }
  return found
}

/**
 * The topmost container whose bounds enclose `worldPoint`, ignoring `exclude`.
 *
 * Used when a drag commits, to decide whether the dragged objects should become
 * members of a frame. The exclusion set matters: an object cannot be dropped
 * into itself, and a frame cannot be dropped into its own contents.
 */
export function containerAt(
  doc: BoardDocument,
  registry: ObjectTypeRegistry,
  worldPoint: Point,
  exclude: ReadonlySet<ObjectId>,
): ObjectId | null {
  const painted = objectsInPaintOrder(doc)
  for (let i = painted.length - 1; i >= 0; i--) {
    const object = painted[i]
    if (object === undefined || object.hidden || object.locked) continue
    if (exclude.has(object.id)) continue
    if (registry.get(object.type)?.capabilities.canHaveChildren !== true) continue
    if (containsPoint(registry.boundsOf(object, doc), worldPoint)) return object.id
  }
  return null
}
