import type { Point, Rect } from '@openframe/core'

import { alignToNeighbours, type AlignmentGuide } from '../../scene/alignment.js'
import { snapDelta } from '../../scene/snapping.js'

/**
 * How close, in SCREEN pixels, a drag must come before a divider captures it.
 *
 * Screen pixels rather than world units, divided by the zoom at use: a fixed
 * world tolerance would grab from across the board when zoomed out and be
 * unreachable when zoomed in.
 */
export const ALIGN_TOLERANCE_PX = 6

/**
 * Where a dragged selection actually lands.
 *
 * Alignment to neighbours BEATS the grid, per axis. Lining up with the object
 * next to it is what the user is looking at; the grid is the fallback for an
 * axis nothing is near. Applying both would fight — the grid would drag the
 * selection back off an alignment it had just captured.
 *
 * Cmd/Ctrl suspends both, because it is the "stop helping" key rather than the
 * "grid off" key.
 */
export function resolveDragDelta(
  startBounds: Rect | null,
  targets: readonly Rect[],
  raw: Point,
  snapping: boolean,
  zoom: number,
): { x: number; y: number; guides: readonly AlignmentGuide[] } {
  if (!snapping || startBounds === null) return { ...raw, guides: [] }

  const aligned = alignToNeighbours(startBounds, raw, targets, ALIGN_TOLERANCE_PX / zoom)
  const grid = snapDelta(startBounds, aligned.delta)

  return {
    x: aligned.snapped.x ? aligned.delta.x : grid.x,
    y: aligned.snapped.y ? aligned.delta.y : grid.y,
    guides: aligned.guides,
  }
}
