import type { Point, Rect, TableData } from '@openframe/core'

/**
 * Where a table's cells fall, given the box it is drawn in.
 *
 * Pure view geometry, like everything else in `scene/`. The weights in
 * `TableData` say how to divide the frame; the frame says how big it is. That
 * split is what lets the ordinary resize gesture work on a table without the
 * type having to interpret it.
 */

/** Cumulative fractions of the whole, one per boundary after the first. */
function edges(weights: readonly number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const found: number[] = []
  let running = 0
  for (const weight of weights) {
    running += weight
    // Guarded rather than assumed: the schema refuses a zero weight, but this
    // also runs against objects that arrived from another client.
    found.push(total > 0 ? running / total : 0)
  }
  return found
}

/** Which slot a fraction along an axis lands in. */
function slot(fractions: readonly number[], where: number): number {
  for (const [index, edge] of fractions.entries()) {
    if (where < edge) return index
  }
  return Math.max(0, fractions.length - 1)
}

/**
 * The cell under a world point, or `null` when the point is outside the table.
 *
 * Used to put the caret where somebody double-clicked. Outside is `null`
 * rather than the nearest cell: a double-click that missed should not silently
 * open a cell several rows away from where it landed.
 */
export function cellAt(
  data: TableData,
  frame: Rect,
  point: Point,
): { column: number; row: number } | null {
  if (frame.width <= 0 || frame.height <= 0) return null

  const x = (point.x - frame.x) / frame.width
  const y = (point.y - frame.y) / frame.height
  if (x < 0 || x > 1 || y < 0 || y > 1) return null

  return {
    column: slot(edges(data.columns), x),
    row: slot(edges(data.rows), y),
  }
}

/**
 * CSS `grid-template` tracks for a set of weights.
 *
 * `fr` is exactly this model — a share of what is left — so the browser does
 * the division and a resize needs no recalculation at all.
 */
export function tracks(weights: readonly number[]): string {
  return weights.map((weight) => `${String(weight)}fr`).join(' ')
}
