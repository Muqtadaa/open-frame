import { clampZoom, screenToWorld, type Point, type Viewport } from '@openframe/core'

/** Where two fingers came down, and the view they came down on. */
export interface PinchStart {
  readonly viewport: Viewport
  /** Each finger, in screen pixels relative to the canvas. */
  readonly a: Point
  readonly b: Point
}

/**
 * The view two fingers ask for, from where they started to where they are.
 *
 * Measured from the START rather than step by step, so rounding never
 * accumulates over a long pinch: what was under the fingers' midpoint when
 * they came down stays under their midpoint now, and the zoom is the start's
 * scaled by how far apart they have moved. Zooming and panning are one
 * gesture on a touch screen, and this is both at once.
 */
export function pinchViewport(start: PinchStart, a: Point, b: Point): Viewport {
  const before = Math.hypot(start.b.x - start.a.x, start.b.y - start.a.y)
  const after = Math.hypot(b.x - a.x, b.y - a.y)
  // Fingers that came down on the same spot have no scale to compare yet.
  const zoom =
    before === 0 ? start.viewport.zoom : clampZoom(start.viewport.zoom * (after / before))
  const held = screenToWorld(start.viewport, {
    x: (start.a.x + start.b.x) / 2,
    y: (start.a.y + start.b.y) / 2,
  })
  const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  return { zoom, x: held.x - midpoint.x / zoom, y: held.y - midpoint.y / zoom }
}
