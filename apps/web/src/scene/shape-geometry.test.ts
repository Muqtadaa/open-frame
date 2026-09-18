import { SHAPE_KINDS, type ShapeKind } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { SHAPE_GEOMETRY, containsPoint, labelInset, shapePath } from './shape-geometry.js'

/** The four corners of a shape's label box, in the normalised 0–100 box. */
function labelCorners(kind: ShapeKind) {
  const { top, right, bottom, left } = SHAPE_GEOMETRY[kind].label
  const x0 = left
  const x1 = 100 - right
  const y0 = top
  const y1 = 100 - bottom
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
}

describe('shape geometry', () => {
  it('defines every registered shape kind', () => {
    expect(Object.keys(SHAPE_GEOMETRY).sort()).toEqual([...SHAPE_KINDS].sort())
  })

  /**
   * The bug this module exists to prevent: a label centred in the bounding box
   * runs outside any shape with a sloped edge. Checking the corners against the
   * real outline is what stops the next polygon repeating it.
   */
  it.each(SHAPE_KINDS)('keeps the %s label area inside the outline', (kind) => {
    for (const corner of labelCorners(kind)) {
      expect(containsPoint(kind, corner), `corner ${JSON.stringify(corner)} escapes ${kind}`).toBe(
        true,
      )
    }
  })

  it.each(SHAPE_KINDS)('gives %s a label area with usable room', (kind) => {
    const { top, right, bottom, left } = SHAPE_GEOMETRY[kind].label
    expect(100 - left - right).toBeGreaterThanOrEqual(40)
    expect(100 - top - bottom).toBeGreaterThanOrEqual(25)
  })

  it('renders a closed path for every polygon, and none for the ellipse', () => {
    for (const kind of SHAPE_KINDS) {
      const path = shapePath(kind)
      if (kind === 'ellipse') {
        expect(path).toBeNull()
        continue
      }
      expect(path).toMatch(/^M[\d. ]+( L[\d. ]+)+ Z$/)
    }
  })

  it('formats the label area as a CSS inset', () => {
    expect(labelInset('rectangle')).toBe('8% 8% 8% 8%')
  })
})

describe('containsPoint', () => {
  it('agrees with hand-checked points on the triangle', () => {
    // Apex region is empty space at the sides; the base is solid.
    expect(containsPoint('triangle', { x: 50, y: 90 })).toBe(true)
    expect(containsPoint('triangle', { x: 10, y: 10 })).toBe(false)
    expect(containsPoint('triangle', { x: 90, y: 10 })).toBe(false)
  })

  it('agrees with hand-checked points on the ellipse', () => {
    expect(containsPoint('ellipse', { x: 50, y: 50 })).toBe(true)
    // Corners of the bounding box are outside an inscribed ellipse.
    expect(containsPoint('ellipse', { x: 4, y: 4 })).toBe(false)
  })

  it('places the corners of a rectangle inside it', () => {
    expect(containsPoint('rectangle', { x: 50, y: 50 })).toBe(true)
    expect(containsPoint('rectangle', { x: 99.5, y: 99.5 })).toBe(false)
  })
})
