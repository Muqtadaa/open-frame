import {
  ancestorsOf,
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

/**
 * What clicking `id` should actually select.
 *
 * A member of a group selects the group instead — that is what makes a group
 * one thing. The OUTERMOST such ancestor wins, so clicking into nested groups
 * gets the whole assembly rather than the innermost box; getting inside is the
 * job of an explicit gesture, not of a plain click.
 *
 * Driven by the `selectsAsUnit` capability rather than by a check for a group,
 * so a frame keeps its opposite behaviour — clicking a note in a frame selects
 * the note — without either type being named here.
 */
export function selectionTargetFor(
  doc: BoardDocument,
  registry: ObjectTypeRegistry,
  id: ObjectId,
): ObjectId {
  const ancestors = ancestorsOf(doc, id)
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestorId = ancestors[i]
    if (ancestorId === undefined) continue
    const ancestor = doc.objects.get(ancestorId)
    if (ancestor === undefined) continue
    if (registry.get(ancestor.type)?.capabilities.selectsAsUnit === true) return ancestorId
  }
  return id
}

/**
 * The object directly under the pointer, ignoring group membership.
 *
 * Used by gestures that mean "get inside" — double-clicking into a group to
 * edit one of its members.
 */
export function hitTestRaw(
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

/** Hit testing as selection means it: a member resolves to its group. */
export function hitTest(
  doc: BoardDocument,
  registry: ObjectTypeRegistry,
  worldPoint: Point,
): ObjectId | null {
  const hit = hitTestRaw(doc, registry, worldPoint)
  return hit === null ? null : selectionTargetFor(doc, registry, hit)
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
  const found = new Set<ObjectId>()
  for (const object of objectsInPaintOrder(doc)) {
    if (object.hidden || object.locked) continue
    if (!contains(region, registry.boundsOf(object, doc))) continue
    // Resolved and de-duplicated: a marquee over a group would otherwise return
    // the group AND every member, and dragging that selection would move each
    // member twice.
    found.add(selectionTargetFor(doc, registry, object.id))
  }
  return [...found]
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
