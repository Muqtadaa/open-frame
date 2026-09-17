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
