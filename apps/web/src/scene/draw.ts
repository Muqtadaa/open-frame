import type { Point, Rect } from '@openframe/core'

import { GRID_SIZE, snapValue } from './snapping.js'

/**
 * Below this, in world units, a drag was a click that wobbled.
 *
 * Draw-to-size must not take away click-to-place: a user who taps the shape
 * tool and clicks still gets a shape at the type's own default size, and a
 * three-pixel tremor must not produce a three-pixel object they then cannot
 * find or grab.
 */
export const DRAW_MIN_SIZE = 8

/**
 * The rectangle a draw gesture has swept out.
 *
 * Normalised, so dragging up-and-left works exactly like down-and-right — the
 * origin is wherever the pointer went down, not the top-left corner.
 *
 * `constrained` (Shift) forces equal sides, which is how every graphics tool
 * draws a square or a circle. The side taken is the LONGER of the two, so the
 * shape always covers the gesture rather than shrinking inside it, and it
 * extends in the direction the pointer actually went.
 */
export function drawnRect(origin: Point, current: Point, constrained: boolean): Rect {
  let dx = current.x - origin.x
  let dy = current.y - origin.y

  if (constrained) {
    const side = Math.max(Math.abs(dx), Math.abs(dy))
    dx = Math.sign(dx) * side || side
    dy = Math.sign(dy) * side || side
  }

  return {
    x: Math.min(origin.x, origin.x + dx),
    y: Math.min(origin.y, origin.y + dy),
    width: Math.abs(dx),
    height: Math.abs(dy),
  }
}

/**
 * The rect a draw gesture commits, or `null` when it was really a click.
 *
 * Snapping is applied to the EDGES rather than to the origin and the size
 * separately: snapping a corner and then a width lands the far edge off-grid,
 * which is visible the moment two drawn shapes are meant to line up.
 */
export function committedRect(
  origin: Point,
  current: Point,
  constrained: boolean,
  snap: boolean,
): Rect | null {
  const rect = drawnRect(origin, current, constrained)
  if (rect.width < DRAW_MIN_SIZE || rect.height < DRAW_MIN_SIZE) return null
  if (!snap) return rect

  const left = snapValue(rect.x, GRID_SIZE)
  const top = snapValue(rect.y, GRID_SIZE)
  const right = snapValue(rect.x + rect.width, GRID_SIZE)
  const bottom = snapValue(rect.y + rect.height, GRID_SIZE)
  return {
    x: left,
    y: top,
    // A shape snapped to nothing is a shape that vanished; one grid cell is the
    // smallest thing the grid can honestly express.
    width: Math.max(GRID_SIZE, right - left),
    height: Math.max(GRID_SIZE, bottom - top),
  }
}

/**
 * A point constrained to lie on the horizontal or vertical through `origin`.
 *
 * What Shift does while drawing a connector, matching every graphics tool: the
 * axis is chosen by which way the pointer has travelled further, so the line
 * follows the gesture rather than fighting it, and it re-decides as the pointer
 * moves — a user who starts sideways and ends up going down gets the vertical.
 */
export function constrainToAxis(origin: Point, current: Point): Point {
  return Math.abs(current.x - origin.x) >= Math.abs(current.y - origin.y)
    ? { x: current.x, y: origin.y }
    : { x: origin.x, y: current.y }
}
