import {
  intersects,
  objectsInPaintOrder,
  type AnyOpenFrameObject,
  type BoardDocument,
  type ObjectTypeRegistry,
  type Rect,
} from '@openframe/core'

/**
 * Viewport culling — the single most important rendering decision in the app.
 *
 * Only objects that intersect the visible world rect get a DOM node. That is
 * what makes a DOM/SVG renderer viable at board scale: node count tracks what
 * is ON SCREEN (typically a few hundred), not what exists (potentially tens of
 * thousands).
 *
 * The implementation is a linear scan over paint order, which is the right
 * choice at Phase 1 scale and is NOT a placeholder to feel bad about: a spatial
 * index returns unordered results, so paint order would have to be restored
 * afterwards anyway. When profiling says this is the bottleneck, the
 * `SpatialIndex` port in core is where the replacement goes — every caller
 * already goes through this function.
 */
export function cullToViewport(
  doc: BoardDocument,
  registry: ObjectTypeRegistry,
  visible: Rect,
  padding = 0,
): AnyOpenFrameObject[] {
  const region =
    padding === 0
      ? visible
      : {
          x: visible.x - padding,
          y: visible.y - padding,
          width: visible.width + padding * 2,
          height: visible.height + padding * 2,
        }

  const result: AnyOpenFrameObject[] = []
  for (const object of objectsInPaintOrder(doc)) {
    if (object.hidden) continue
    if (intersects(region, registry.boundsOf(object))) result.push(object)
  }
  return result
}
