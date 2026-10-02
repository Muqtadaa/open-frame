import type { Point, Rect } from '@openframe/core'

import {
  alignToNeighbours,
  exactlyAligned,
  guidesAround,
  type AlignmentGuide,
} from '../../scene/alignment.js'
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
  if (startBounds === null) return { ...raw, guides: [] }
  if (!snapping) {
    // Cmd/Ctrl stops the help, not the information: nothing is pulled into
    // line, but where it lands in line by hand the guide and its gap show.
    const placed = { ...startBounds, x: startBounds.x + raw.x, y: startBounds.y + raw.y }
    return { ...raw, guides: guidesAround(placed, targets, exactlyAligned(placed, targets)) }
  }

  const aligned = alignToNeighbours(startBounds, raw, targets, ALIGN_TOLERANCE_PX / zoom)
  const grid = snapDelta(startBounds, aligned.delta)
  const x = aligned.snapped.x ? aligned.delta.x : grid.x
  const y = aligned.snapped.y ? aligned.delta.y : grid.y

  // The guides describe where it LANDS, so a gap along the axis the grid
  // decided moves in grid steps with the element rather than with the pointer.
  const placed = { ...startBounds, x: startBounds.x + x, y: startBounds.y + y }
  return { x, y, guides: guidesAround(placed, targets, aligned.snapped) }
}
