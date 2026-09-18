import { describe, expect, it } from 'vitest'

import { arrivalAngle, connectorPath, pathMidpoint } from './connector-path.js'

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

describe('arrivalAngle', () => {
  it('points along the line for a straight route', () => {
    expect(arrivalAngle({ x: 0, y: 0 }, { x: 100, y: 0 }, 'straight')).toBeCloseTo(0, 10)
    expect(arrivalAngle({ x: 0, y: 0 }, { x: 0, y: 100 }, 'straight')).toBeCloseTo(Math.PI / 2, 10)
  })

  /** An orthogonal route always arrives along an axis, so the head must too. */
  it('snaps to an axis for an orthogonal route', () => {
    const angle = arrivalAngle({ x: 0, y: 0 }, { x: 400, y: 30 }, 'orthogonal')
    expect(Math.abs(Math.sin(angle))).toBeCloseTo(1, 10)
  })
})
