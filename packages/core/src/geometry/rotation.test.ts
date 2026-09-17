import { describe, expect, it } from 'vitest'

import { point, rotatePoint } from './point.js'
import { containsRotatedPoint, corners, rotatedBounds } from './rect.js'

const square = { x: 0, y: 0, width: 100, height: 100 }

describe('rotatePoint', () => {
  it('returns the same point for no rotation', () => {
    expect(rotatePoint(point(3, 4), point(0, 0), 0)).toEqual(point(3, 4))
  })

  it('rotates a quarter turn', () => {
    const rotated = rotatePoint(point(1, 0), point(0, 0), Math.PI / 2)
    expect(rotated.x).toBeCloseTo(0, 10)
    expect(rotated.y).toBeCloseTo(1, 10)
  })

  it('leaves the origin fixed', () => {
    const origin = point(50, 50)
    expect(rotatePoint(origin, origin, 1.234)).toEqual(origin)
  })
})

describe('rotatedBounds', () => {
  it('is the original rect when unrotated', () => {
    expect(rotatedBounds(square, 0)).toEqual(square)
  })

  it('is unchanged by a quarter turn of a square', () => {
    const bounds = rotatedBounds(square, Math.PI / 2)
    expect(bounds.width).toBeCloseTo(100, 8)
    expect(bounds.height).toBeCloseTo(100, 8)
  })

  /**
   * The case that matters for culling: a rotated object occupies MORE
   * axis-aligned space than its frame, and using the frame would make it vanish
   * at the viewport edge while still visible.
   */
  it('grows for a 45 degree rotation', () => {
    const bounds = rotatedBounds(square, Math.PI / 4)
    expect(bounds.width).toBeCloseTo(Math.SQRT2 * 100, 6)
    expect(bounds.width).toBeGreaterThan(square.width)
  })

  it('stays centred on the original centre', () => {
    const bounds = rotatedBounds({ x: 10, y: 20, width: 80, height: 40 }, 0.7)
    expect(bounds.x + bounds.width / 2).toBeCloseTo(50, 8)
    expect(bounds.y + bounds.height / 2).toBeCloseTo(40, 8)
  })

  it('swaps extents for a quarter-turned oblong', () => {
    const bounds = rotatedBounds({ x: 0, y: 0, width: 200, height: 50 }, Math.PI / 2)
    expect(bounds.width).toBeCloseTo(50, 8)
    expect(bounds.height).toBeCloseTo(200, 8)
  })
})

describe('containsRotatedPoint', () => {
  it('matches the plain test when unrotated', () => {
    expect(containsRotatedPoint(square, 0, point(50, 50))).toBe(true)
    expect(containsRotatedPoint(square, 0, point(150, 50))).toBe(false)
  })

  it('always contains the centre', () => {
    expect(containsRotatedPoint(square, 1.1, point(50, 50))).toBe(true)
  })

  /**
   * The point of rotating the POINT rather than the rect: a corner that was
   * inside the unrotated frame falls outside once the object turns, and hit
   * testing must agree with what is drawn.
   */
  it('excludes a corner that rotation moved away', () => {
    const oblong = { x: 0, y: 0, width: 200, height: 20 }
    const nearRightEdge = point(195, 10)
    expect(containsRotatedPoint(oblong, 0, nearRightEdge)).toBe(true)
    expect(containsRotatedPoint(oblong, Math.PI / 2, nearRightEdge)).toBe(false)
  })

  it('includes a point the rotation moved into the shape', () => {
    const oblong = { x: 0, y: 0, width: 200, height: 20 }
    const aboveCentre = point(100, -80)
    expect(containsRotatedPoint(oblong, 0, aboveCentre)).toBe(false)
    expect(containsRotatedPoint(oblong, Math.PI / 2, aboveCentre)).toBe(true)
  })

  it('has four corners, clockwise from the top left', () => {
    expect(corners(square)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ])
  })
})
