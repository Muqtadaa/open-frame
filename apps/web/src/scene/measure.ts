import type { Rect } from '@openframe/core'

/**
 * Measuring on purpose: what Alt shows between the selection and the object
 * under the pointer, and between the things that are selected.
 *
 * Pure geometry over bounds, so it knows nothing of types (rule 5) and costs
 * what the selection costs — the caller hands it the boxes it already has.
 *
 * A SEGMENT measures along its axis: an `x` segment is a horizontal line from
 * `from` to `to`, drawn at height `at`. A MATCH is a line where an edge or a
 * centre is shared, named like an alignment guide: an `x` match is a vertical
 * line at `position`, spanning `start` to `end`.
 */
export interface MeasureSegment {
  readonly axis: 'x' | 'y'
  readonly from: number
  readonly to: number
  readonly at: number
}

export interface MeasureMatch {
  readonly axis: 'x' | 'y'
  readonly position: number
  readonly start: number
  readonly end: number
}

/** Two places are one place to a tolerance, never to the bit (rule 25). */
const EPSILON = 0.01

interface Span {
  readonly from: number
  readonly to: number
}

function span(rect: Rect, axis: 'x' | 'y'): Span {
  return axis === 'x'
    ? { from: rect.x, to: rect.x + rect.width }
    : { from: rect.y, to: rect.y + rect.height }
}

function centre(rect: Rect, axis: 'x' | 'y'): number {
  const s = span(rect, axis)
  return (s.from + s.to) / 2
}

const other = (axis: 'x' | 'y'): 'x' | 'y' => (axis === 'x' ? 'y' : 'x')

function within(inner: Span, outer: Span): boolean {
  return inner.from >= outer.from - EPSILON && inner.to <= outer.to + EPSILON
}

/**
 * Where to draw a line across the gap between two boxes: through the middle
 * of what they share on the other axis, or — when they share nothing, sitting
 * diagonally apart — through the middle of the first one.
 */
function crossing(a: Rect, b: Rect, axis: 'x' | 'y', fallback: number): number {
  const across = other(axis)
  const sa = span(a, across)
  const sb = span(b, across)
  const from = Math.max(sa.from, sb.from)
  const to = Math.min(sa.to, sb.to)
  return to >= from ? (from + to) / 2 : fallback
}

/** The gap between two boxes along one axis, or nothing if they overlap on it. */
function gapAlong(a: Rect, b: Rect, axis: 'x' | 'y', fallback: number): MeasureSegment | null {
  const sa = span(a, axis)
  const sb = span(b, axis)
  if (sa.to <= sb.from + EPSILON && sb.from - sa.to > EPSILON) {
    return { axis, from: sa.to, to: sb.from, at: crossing(a, b, axis, fallback) }
  }
  if (sb.to <= sa.from + EPSILON && sa.from - sb.to > EPSILON) {
    return { axis, from: sb.to, to: sa.from, at: crossing(a, b, axis, fallback) }
  }
  return null
}

/**
 * How far apart two boxes are, as the lines a design tool draws.
 *
 * Side by side, one line across the gap; apart on both axes, one on each, from
 * the selection; one inside the other, a line from each edge of the inner one
 * to the outer one's. Overlapping without one holding the other says nothing,
 * because there is no gap to measure.
 */
export function distancesBetween(selection: Rect, target: Rect): readonly MeasureSegment[] {
  const inside =
    within(span(selection, 'x'), span(target, 'x')) &&
    within(span(selection, 'y'), span(target, 'y'))
      ? { inner: selection, outer: target }
      : within(span(target, 'x'), span(selection, 'x')) &&
          within(span(target, 'y'), span(selection, 'y'))
        ? { inner: target, outer: selection }
        : null

  if (inside !== null) {
    const segments: MeasureSegment[] = []
    for (const axis of ['x', 'y'] as const) {
      const inner = span(inside.inner, axis)
      const outer = span(inside.outer, axis)
      const at = centre(inside.inner, other(axis))
      if (inner.from - outer.from > EPSILON) {
        segments.push({ axis, from: outer.from, to: inner.from, at })
      }
      if (outer.to - inner.to > EPSILON) segments.push({ axis, from: inner.to, to: outer.to, at })
    }
    return segments
  }

  const segments: MeasureSegment[] = []
  for (const axis of ['x', 'y'] as const) {
    const gap = gapAlong(selection, target, axis, centre(selection, other(axis)))
    if (gap !== null) segments.push(gap)
  }
  return segments
}

function stops(rect: Rect, axis: 'x' | 'y'): readonly number[] {
  const s = span(rect, axis)
  return [s.from, (s.from + s.to) / 2, s.to]
}

/**
 * Where two boxes line up exactly: a shared left, centre or right, top,
 * middle or bottom. Only exact ones — a near miss is what dragging into line
 * is for, and drawn here it reads as a claim that they match.
 */
export function matchesBetween(a: Rect, b: Rect): readonly MeasureMatch[] {
  const matches: MeasureMatch[] = []
  for (const axis of ['x', 'y'] as const) {
    const across = other(axis)
    const start = Math.min(span(a, across).from, span(b, across).from)
    const end = Math.max(span(a, across).to, span(b, across).to)
    const seen: number[] = []
    for (const mine of stops(a, axis)) {
      if (!stops(b, axis).some((theirs) => Math.abs(theirs - mine) <= EPSILON)) continue
      if (seen.some((position) => Math.abs(position - mine) <= EPSILON)) continue
      seen.push(mine)
      matches.push({ axis, position: mine, start, end })
    }
  }
  return matches
}

/**
 * The gaps between neighbours inside a selection, along each axis: a row
 * measured across, a column measured down. Neighbours only — the first and the
 * third of a row are not measured past the second — and nothing between
 * things that overlap.
 */
export function gapsWithin(rects: readonly Rect[]): readonly MeasureSegment[] {
  const segments: MeasureSegment[] = []
  for (const axis of ['x', 'y'] as const) {
    const ordered = [...rects].sort((a, b) => span(a, axis).from - span(b, axis).from)
    /*
     * Measured from the FURTHEST reach so far, not from whichever started
     * last: a narrow thing inside a wide one's stretch would otherwise have
     * the next gap drawn straight through the wide one.
     */
    let reach = ordered[0]
    for (const next of ordered.slice(1)) {
      if (reach === undefined) break
      const midway = (centre(reach, other(axis)) + centre(next, other(axis))) / 2
      const gap = gapAlong(reach, next, axis, midway)
      if (gap !== null && gap.from === span(reach, axis).to) segments.push(gap)
      if (span(next, axis).to > span(reach, axis).to) reach = next
    }
  }
  return segments
}

/**
 * How far the selection is from the nearest thing on each side of it: left
 * and right among what shares its row, above and below among what shares its
 * column. What nudging with the arrows shows on every press, so a selection
 * can be walked into place a unit at a time.
 *
 * Only things in line with it count. The nearest thing to the left that is
 * also far below is not "to the left" in any sense anybody arranging a row
 * means.
 */
export function nearestDistances(
  selection: Rect,
  others: readonly Rect[],
): readonly MeasureSegment[] {
  const segments: MeasureSegment[] = []
  for (const axis of ['x', 'y'] as const) {
    const across = other(axis)
    const mine = span(selection, axis)
    const myAcross = span(selection, across)
    let before: Rect | null = null
    let after: Rect | null = null
    for (const candidate of others) {
      const theirAcross = span(candidate, across)
      const shared =
        Math.min(myAcross.to, theirAcross.to) - Math.max(myAcross.from, theirAcross.from)
      if (shared <= EPSILON) continue
      const theirs = span(candidate, axis)
      if (theirs.to <= mine.from + EPSILON) {
        if (before === null || theirs.to > span(before, axis).to) before = candidate
      } else if (theirs.from >= mine.to - EPSILON) {
        if (after === null || theirs.from < span(after, axis).from) after = candidate
      }
    }
    for (const neighbour of [before, after]) {
      if (neighbour === null) continue
      const gap = gapAlong(selection, neighbour, axis, centre(selection, across))
      if (gap !== null) segments.push(gap)
    }
  }
  return segments
}
