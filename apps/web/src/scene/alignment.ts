import {
  ancestorsOf,
  type AnyOpenFrameObject,
  type BoardDocument,
  type ObjectId,
  type ObjectTypeRegistry,
  type Point,
  type Rect,
} from '@openframe/core'

/**
 * Alignment guides: snapping a dragged selection to its neighbours' edges and
 * centres, and reporting the lines to draw.
 *
 * Pure geometry over rectangles. It knows nothing about the document, the
 * drag or React, so the rules can be tested without synthesising a gesture.
 */

/**
 * The rectangles a drag can align against: what is on screen, minus what is
 * moving.
 *
 * Collected ONCE at gesture start, not per pointer event. The static objects do
 * not move during a drag, so recomputing this per frame would be the per-object
 * O(n) scan rule 10 exists to prevent — and it would do it sixty times a
 * second.
 *
 * Descendants of the selection are excluded as well as the selection itself: a
 * note inside a dragged frame travels with it, so aligning the frame to its own
 * child would snap it to a position it is already in.
 */
export function alignmentTargets(
  doc: BoardDocument,
  registry: ObjectTypeRegistry,
  visible: readonly AnyOpenFrameObject[],
  selection: ReadonlySet<ObjectId>,
): Rect[] {
  if (selection.size === 0) return []
  return visible
    .filter(
      (object) =>
        !selection.has(object.id) &&
        !ancestorsOf(doc, object.id).some((id) => selection.has(id)),
    )
    .map((object) => registry.boundsOf(object, doc))
}

/** A line to draw, in world coordinates. */
export interface AlignmentGuide {
  /** `x` is a VERTICAL line at `position`; `y` is a horizontal one. */
  readonly axis: 'x' | 'y'
  readonly position: number
  /** Extent along the other axis, covering every rectangle that lines up. */
  readonly start: number
  readonly end: number
}

export interface AlignmentResult {
  readonly delta: Point
  readonly guides: readonly AlignmentGuide[]
  /** Which axes were captured, so the caller knows where NOT to apply the grid. */
  readonly snapped: { readonly x: boolean; readonly y: boolean }
}

/**
 * Slack for comparing a stop that has already been snapped to one.
 *
 * Exact equality is tempting — the offset was computed as `theirs - mine`, so
 * the two ought to coincide — but `mine` is re-derived from a TRANSLATED
 * rectangle (`x + width / 2` on a shifted origin), which is a different
 * arithmetic path, and IEEE-754 does not promise it lands on the same bits.
 * A miss here would silently drop a guide for an alignment that did happen.
 */
const EPSILON = 1e-6

/** Left, centre and right — the three positions a rectangle can align on. */
function stops(rect: Rect, axis: 'x' | 'y'): readonly number[] {
  const near = axis === 'x' ? rect.x : rect.y
  const size = axis === 'x' ? rect.width : rect.height
  return [near, near + size / 2, near + size]
}

function translate(rect: Rect, delta: Point): Rect {
  return { ...rect, x: rect.x + delta.x, y: rect.y + delta.y }
}

/** The smallest offset on one axis that lands a stop on a neighbour's stop. */
function bestOffset(
  moved: Rect,
  others: readonly Rect[],
  axis: 'x' | 'y',
  tolerance: number,
): number | null {
  let best: number | null = null

  for (const mine of stops(moved, axis)) {
    for (const other of others) {
      for (const theirs of stops(other, axis)) {
        const offset = theirs - mine
        if (Math.abs(offset) > tolerance) continue
        /*
         * Ties go to the FIRST candidate found rather than the last, so the
         * result does not depend on document order for an object sitting
         * exactly between two neighbours.
         */
        if (best === null || Math.abs(offset) < Math.abs(best)) best = offset
      }
    }
  }
  return best
}

/**
 * Every rectangle sharing a stop with `moved` on this axis, and the line they
 * share — so aligning three boxes draws one guide spanning all of them rather
 * than three stacked segments.
 */
function guidesFor(
  moved: Rect,
  others: readonly Rect[],
  axis: 'x' | 'y',
): readonly AlignmentGuide[] {
  const cross = axis === 'x' ? 'y' : 'x'
  const crossSize = axis === 'x' ? 'height' : 'width'
  const guides = new Map<number, AlignmentGuide>()

  for (const mine of stops(moved, axis)) {
    const matched = others.filter((other) =>
      stops(other, axis).some((theirs) => Math.abs(theirs - mine) <= EPSILON),
    )
    if (matched.length === 0) continue

    const spans = [moved, ...matched].map((rect) => ({
      from: rect[cross],
      to: rect[cross] + rect[crossSize],
    }))
    guides.set(mine, {
      axis,
      position: mine,
      start: Math.min(...spans.map((s) => s.from)),
      end: Math.max(...spans.map((s) => s.to)),
    })
  }
  return [...guides.values()]
}

/**
 * Adjusts `delta` so the selection lines up with nearby objects, and returns
 * the guides to draw.
 *
 * `tolerance` is in WORLD units, so the caller divides a screen-pixel threshold
 * by the zoom — otherwise guides would grab from a metre away when zoomed out
 * and be unreachable when zoomed in.
 *
 * Alignment is resolved per axis. A selection can be captured horizontally by
 * one neighbour while staying free vertically, which is what makes nudging
 * something into a row feel like it is being helped rather than fought.
 */
export function alignToNeighbours(
  bounds: Rect,
  delta: Point,
  others: readonly Rect[],
  tolerance: number,
): AlignmentResult {
  if (others.length === 0 || tolerance <= 0) {
    return { delta, guides: [], snapped: { x: false, y: false } }
  }

  const dragged = translate(bounds, delta)
  const offsetX = bestOffset(dragged, others, 'x', tolerance)
  const offsetY = bestOffset(dragged, others, 'y', tolerance)

  const adjusted: Point = {
    x: delta.x + (offsetX ?? 0),
    y: delta.y + (offsetY ?? 0),
  }
  const settled = translate(bounds, adjusted)

  return {
    delta: adjusted,
    guides: [
      ...(offsetX === null ? [] : guidesFor(settled, others, 'x')),
      ...(offsetY === null ? [] : guidesFor(settled, others, 'y')),
    ],
    snapped: { x: offsetX !== null, y: offsetY !== null },
  }
}
