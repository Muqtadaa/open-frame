import type { Point } from './point.js'

/**
 * An axis-aligned rectangle. `width` and `height` are always non-negative;
 * helpers that could produce a negative extent normalise instead.
 */
export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height }
}

/** Builds a rect from two opposite corners in any order (marquee selection). */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}

export const right = (r: Rect): number => r.x + r.width
export const bottom = (r: Rect): number => r.y + r.height

export function center(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}

export function containsPoint(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= right(r) && p.y >= r.y && p.y <= bottom(r)
}

/** True when the rects overlap. Edge-only contact counts as intersecting. */
export function intersects(a: Rect, b: Rect): boolean {
  return !(right(a) < b.x || right(b) < a.x || bottom(a) < b.y || bottom(b) < a.y)
}

/** True when `outer` fully encloses `inner`. Used by marquee selection. */
export function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    right(inner) <= right(outer) &&
    bottom(inner) <= bottom(outer)
  )
}

/** Smallest rect enclosing both inputs. */
export function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(right(a), right(b)) - x,
    height: Math.max(bottom(a), bottom(b)) - y,
  }
}

/**
 * Smallest rect enclosing every input. Returns `null` for an empty list rather
 * than a zero rect, so callers must decide what "no bounds" means for them.
 */
export function unionAll(rects: readonly Rect[]): Rect | null {
  const first = rects[0]
  if (first === undefined) return null
  let acc = first
  for (let i = 1; i < rects.length; i++) {
    const next = rects[i]
    if (next !== undefined) acc = union(acc, next)
  }
  return acc
}

/** Grows (or, with a negative amount, shrinks) a rect on every side. */
export function inflate(r: Rect, amount: number): Rect {
  return {
    x: r.x - amount,
    y: r.y - amount,
    width: Math.max(0, r.width + amount * 2),
    height: Math.max(0, r.height + amount * 2),
  }
}

export function translateRect(r: Rect, dx: number, dy: number): Rect {
  return { x: r.x + dx, y: r.y + dy, width: r.width, height: r.height }
}

export function rectsEqual(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}
