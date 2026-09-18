import type { Point, Rect } from '@openframe/core'

/**
 * Grid spacing in WORLD units.
 *
 * Ten keeps the default object sizes on-grid (a sticky is 180, a shape 160×120,
 * a frame 640×420) so snapping never nudges a freshly created object, and it is
 * coarse enough to feel deliberate without fighting fine positioning.
 */
export const GRID_SIZE = 10

export function snapValue(value: number, grid = GRID_SIZE): number {
  return Math.round(value / grid) * grid
}

export function snapPoint(p: Point, grid = GRID_SIZE): Point {
  return { x: snapValue(p.x, grid), y: snapValue(p.y, grid) }
}

/**
 * The delta that puts `bounds` on the grid after moving by `delta`.
 *
 * Snapping the SELECTION's top-left and applying the resulting delta to every
 * member is what keeps a multi-selection's internal alignment intact. Snapping
 * each object independently would shuffle them relative to one another, which
 * looks like a bug even though every object is individually on-grid.
 */
export function snapDelta(bounds: Rect, delta: Point, grid = GRID_SIZE): Point {
  const targetX = bounds.x + delta.x
  const targetY = bounds.y + delta.y
  return {
    x: snapValue(targetX, grid) - bounds.x,
    y: snapValue(targetY, grid) - bounds.y,
  }
}

/**
 * Snaps a rectangle's edges.
 *
 * Both edges are snapped rather than the origin plus a snapped size, so a
 * resized object lines up with its neighbours on the side being dragged —
 * which is the side the user is looking at.
 */
export function snapRect(rect: Rect, grid = GRID_SIZE): Rect {
  const x = snapValue(rect.x, grid)
  const y = snapValue(rect.y, grid)
  const right = snapValue(rect.x + rect.width, grid)
  const bottom = snapValue(rect.y + rect.height, grid)
  return {
    x,
    y,
    width: Math.max(grid, right - x),
    height: Math.max(grid, bottom - y),
  }
}
