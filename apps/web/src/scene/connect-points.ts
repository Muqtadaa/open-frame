import type { Point, Rect } from '@openframe/core'

/**
 * Where an object's connection points sit.
 *
 * OUTSIDE the object, not on its edge. They used to sit exactly on each edge's
 * midpoint — which is precisely where the `n`, `e`, `s` and `w` resize handles
 * are, so the two fought over every press and resizing an object horizontally
 * meant grabbing a connector instead.
 *
 * Outside is also the convention: a connector starts by reaching away from the
 * thing it leaves, and a handle that floats clear of the outline reads as
 * "drag from here to somewhere else" rather than "change this edge".
 */

export type Side = 'top' | 'right' | 'bottom' | 'left'

export const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left']

/**
 * How far clear of the edge, in SCREEN pixels.
 *
 * Two 24px targets do not overlap only when their CENTRES are 24px apart —
 * half of each. The first attempt at this used 18, reasoning only about the
 * resize handle's half and forgetting the connection point has a target of
 * its own; the two still overlapped across a six-pixel band, which is exactly
 * where somebody aiming at the edge would press.
 */
export const CONNECT_OUTSET_PX = 26

/**
 * The pointer target around the drawn dot (WCAG 2.5.8), as the view sizes it.
 *
 * Here rather than in the component because the ROTATE grip has to be placed
 * beyond it, and a number known only to the thing that draws it is a number
 * the next piece of chrome collides with. Which is what happened: moving the
 * connection points off the resize handles put them straight under the rotate
 * grip, and a shape could no longer be rotated at all.
 */
export const CONNECT_TARGET_PX = 24

/** How far the connection point's target reaches from the object's edge. */
export const CONNECT_REACH_PX = CONNECT_OUTSET_PX + CONNECT_TARGET_PX / 2

/**
 * How far any PANEL must stay from a selected object's edge.
 *
 * The inspector floats beside the selection, and it used to sit 14px away —
 * fine when the connection points were on the edge, and directly on top of
 * them once they moved outside it. A panel covering a control is a control
 * that cannot be pressed, so the distance is derived from the chrome's reach
 * rather than chosen next to it.
 */
export const PANEL_CLEARANCE_PX = CONNECT_REACH_PX + 4

/**
 * How close a drop counts as aiming AT an anchor, in world units.
 *
 * One definition, because two would be two different answers to "did they
 * mean this anchor or the object": the gesture asks it when a line is let go,
 * and the overlay asks it every frame to mark the anchor under the pointer.
 * A highlight that promised a side the drop did not deliver would be worse
 * than no highlight at all.
 *
 * Derived from the reach of the anchor's own pointer target and divided by
 * the zoom HERE, where it is a world measurement rather than something drawn:
 * a pointer is no more precise at 25% than at 400%, but a world unit is
 * sixteen times as far.
 */
export function anchorReach(zoom: number): number {
  return CONNECT_REACH_PX / Math.max(zoom, 0.0001)
}

/** The outward normal of a side, as a unit vector. */
function outward(side: Side): Point {
  if (side === 'top') return { x: 0, y: -1 }
  if (side === 'bottom') return { x: 0, y: 1 }
  if (side === 'left') return { x: -1, y: 0 }
  return { x: 1, y: 0 }
}

/** The midpoint of a side, which is where a connector actually attaches. */
export function edgeMidpoint(bounds: Rect, side: Side): Point {
  const midX = bounds.x + bounds.width / 2
  const midY = bounds.y + bounds.height / 2
  if (side === 'top') return { x: midX, y: bounds.y }
  if (side === 'bottom') return { x: midX, y: bounds.y + bounds.height }
  if (side === 'left') return { x: bounds.x, y: midY }
  return { x: bounds.x + bounds.width, y: midY }
}

/**
 * Where to DRAW the handle: the edge midpoint, pushed out of the object.
 *
 * `outset` is in world units — the caller divides the screen distance by the
 * zoom, so the gap stays constant on screen however far out the board is.
 */
export function connectPointAt(bounds: Rect, side: Side, outset: number): Point {
  const at = edgeMidpoint(bounds, side)
  const away = outward(side)
  return { x: at.x + away.x * outset, y: at.y + away.y * outset }
}
