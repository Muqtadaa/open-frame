/**
 * A position in a coordinate space. Whether that space is world coordinates or
 * screen coordinates is the caller's responsibility — see `viewport.ts` for the
 * conversions between them.
 *
 * Plain readonly objects, not classes: they serialize directly, compare
 * structurally in tests, and cost nothing to allocate.
 */
export interface Point {
  readonly x: number
  readonly y: number
}

export const ORIGIN: Point = Object.freeze({ x: 0, y: 0 })

export function point(x: number, y: number): Point {
  return { x, y }
}

export function addPoints(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y }
}

export function subtractPoints(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function scalePoint(p: Point, factor: number): Point {
  return { x: p.x * factor, y: p.y * factor }
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** Squared distance. Prefer this for comparisons — it avoids the square root. */
export function distanceSquared(a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return dx * dx + dy * dy
}

export function pointsEqual(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

/** Rotates `p` around `origin` by `radians` (clockwise in screen coordinates). */
export function rotatePoint(p: Point, origin: Point, radians: number): Point {
  if (radians === 0) return p
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const dx = p.x - origin.x
  const dy = p.y - origin.y
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos }
}

/**
 * Shortest distance from a point to a line segment.
 *
 * Used for precise hit testing of thin, long objects — a connector occupies a
 * large bounding box but almost none of it.
 */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return distance(p, a)
  // Projection parameter, clamped so the nearest point stays on the segment.
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared))
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy })
}
