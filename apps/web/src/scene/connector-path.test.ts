import { describe, expect, it } from 'vitest'

import type { Point } from '@openframe/core'

import { arrivalAngle, connectorPath, pathMidpoint, routeAngles } from './connector-path.js'

const start = { x: 0, y: 0 }
const end = { x: 200, y: 100 }

describe('connectorPath', () => {
  it('draws a straight line as a single segment', () => {
    expect(connectorPath(start, end, 'straight')).toBe('M 0 0 L 200 100')
  })

  it('draws an orthogonal route with two turns', () => {
    const path = connectorPath(start, end, 'orthogonal')
    expect(path.match(/L /g)).toHaveLength(3)
  })

  it('turns on the dominant axis first', () => {
    // Wider than tall: the first turn should be horizontal.
    expect(connectorPath(start, { x: 400, y: 20 }, 'orthogonal')).toContain('L 200 0')
    // Taller than wide: the first turn should be vertical.
    expect(connectorPath(start, { x: 20, y: 400 }, 'orthogonal')).toContain('L 0 200')
  })

  it('draws a curve as a cubic bezier', () => {
    expect(connectorPath(start, end, 'curved')).toMatch(/^M 0 0 C /)
  })

  it('always begins at the start point', () => {
    for (const routing of ['straight', 'orthogonal', 'curved'] as const) {
      expect(connectorPath({ x: 7, y: 9 }, end, routing).startsWith('M 7 9')).toBe(true)
    }
  })

  it('handles coincident endpoints without producing NaN', () => {
    for (const routing of ['straight', 'orthogonal', 'curved'] as const) {
      expect(connectorPath(start, start, routing)).not.toContain('NaN')
    }
  })
})

describe('pathMidpoint', () => {
  it('is halfway between the ends', () => {
    expect(pathMidpoint(start, end)).toEqual({ x: 100, y: 50 })
  })
})

/**
 * Every coordinate pair in a path, in order. Enough for these routes, which
 * are made of `M`, `L` and one `C`.
 */
function pointsOf(d: string): { x: number; y: number }[] {
  const numbers = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
  const points: { x: number; y: number }[] = []
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push({ x: numbers[i] ?? 0, y: numbers[i + 1] ?? 0 })
  }
  return points
}

/** The direction of a path's final segment, from the path itself. */
function finalDirection(d: string): number {
  const points = pointsOf(d)
  const last = points[points.length - 1]
  const before = points[points.length - 2]
  if (last === undefined || before === undefined) throw new Error('not enough points')
  return Math.atan2(last.y - before.y, last.x - before.x)
}

/** The direction of a path's first segment, from the path itself. */
function firstDirection(d: string): number {
  const points = pointsOf(d)
  const first = points[0]
  const next = points[1]
  if (first === undefined || next === undefined) throw new Error('not enough points')
  return Math.atan2(next.y - first.y, next.x - first.x)
}

const sameDirection = (a: number, b: number): boolean =>
  Math.abs(Math.cos(a) - Math.cos(b)) < 1e-6 && Math.abs(Math.sin(a) - Math.sin(b)) < 1e-6

/**
 * Where the route meets each end.
 *
 * THE OLD TEST HERE ENSHRINED A BUG. It asserted that a mostly-HORIZONTAL
 * orthogonal route arrives at a VERTICAL angle — `|sin| ≈ 1` — which is
 * exactly backwards: that route goes across, down, and across again, so it
 * arrives horizontally. It passed for as long as it existed, and every
 * orthogonal connector on every board finished with its arrowhead turned
 * ninety degrees off its own line.
 *
 * So these assert against the PATH rather than against a remembered number. A
 * test that derives the expected angle from `connectorPath` cannot enshrine an
 * inversion, because it would have to invert the path as well.
 */
describe('where a route meets its ends', () => {
  const cases: { readonly name: string; readonly start: Point; readonly end: Point }[] = [
    { name: 'mostly horizontal, rightwards', start: { x: 0, y: 0 }, end: { x: 400, y: 30 } },
    { name: 'mostly horizontal, leftwards', start: { x: 400, y: 0 }, end: { x: 0, y: 30 } },
    { name: 'mostly vertical, downwards', start: { x: 0, y: 0 }, end: { x: 30, y: 400 } },
    { name: 'mostly vertical, upwards', start: { x: 0, y: 400 }, end: { x: 30, y: 0 } },
  ]

  for (const { name, start, end } of cases) {
    it(`arrives along the last segment of an orthogonal route — ${name}`, () => {
      const { arrival } = routeAngles(start, end, 'orthogonal')

      expect(sameDirection(arrival, finalDirection(connectorPath(start, end, 'orthogonal')))).toBe(
        true,
      )
    })

    it(`leaves along the first segment of an orthogonal route — ${name}`, () => {
      const { departure } = routeAngles(start, end, 'orthogonal')

      expect(sameDirection(departure, firstDirection(connectorPath(start, end, 'orthogonal')))).toBe(
        true,
      )
    })
  }

  it('points along the line for a straight route', () => {
    expect(arrivalAngle({ x: 0, y: 0 }, { x: 100, y: 0 }, 'straight')).toBeCloseTo(0, 10)
    expect(arrivalAngle({ x: 0, y: 0 }, { x: 0, y: 100 }, 'straight')).toBeCloseTo(Math.PI / 2, 10)
  })

  /**
   * A cubic's direction at an end is the line to its nearest control point,
   * and both are offset along the dominant axis — so a curve arrives along
   * that axis, not along the diagonal between the endpoints.
   */
  it('arrives along the dominant axis for a curved route', () => {
    const { arrival } = routeAngles({ x: 0, y: 0 }, { x: 400, y: 30 }, 'curved')

    expect(Math.abs(Math.cos(arrival))).toBeCloseTo(1, 10)
  })
})
