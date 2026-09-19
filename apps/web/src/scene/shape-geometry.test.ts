import { SHAPE_KINDS, type ShapeKind } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import {
  SHAPE_GEOMETRY,
  containsPoint,
  labelInset,
  roundedShapePath,
  shapePath,
} from './shape-geometry.js'

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

describe('rounded corners', () => {
  /**
   * Drawn in FRAME units, which is the whole reason this function exists
   * rather than a radius added to the normalised path. The box is stretched to
   * the frame, so a radius in box units is stretched with it — on a wide
   * rectangle the corner comes out wider than it is tall, which reads as a
   * rendering fault rather than as a rounded corner.
   */
  it('scales the outline to the frame, not to a 0-100 box', () => {
    const path = roundedShapePath('rectangle', { width: 400, height: 100 }, 'none')

    expect(path).not.toBeNull()
    // The far corner sits at the frame's size less the stroke margin, in px.
    expect(path).toContain('392')
    expect(path).toContain('98')
  })

  it('leaves the outline square when there is no radius', () => {
    const path = roundedShapePath('rectangle', { width: 200, height: 200 }, 'none')

    expect(path).not.toContain('Q')
  })

  it('cuts every corner once when there is', () => {
    const path = roundedShapePath('rectangle', { width: 200, height: 200 }, 'medium')

    // One quadratic per vertex, and a rectangle has four.
    expect(path?.match(/Q/g)).toHaveLength(4)
  })

  it('rounds a hexagon’s six corners too, not only a rectangle’s four', () => {
    const path = roundedShapePath('hexagon', { width: 200, height: 200 }, 'medium')

    expect(path?.match(/Q/g)).toHaveLength(6)
  })

  /** The ellipse has no corners, and is not a polygon to begin with. */
  it('has no path for the ellipse', () => {
    expect(roundedShapePath('ellipse', { width: 200, height: 200 }, 'large')).toBeNull()
  })

  /**
   * A large radius on a small shape must round as far as it can rather than
   * turning the outline inside out. The cut is clamped to half an edge, so two
   * corners sharing a short edge meet in the middle and never cross.
   */
  it('never cuts past the middle of an edge', () => {
    const tiny = roundedShapePath('rectangle', { width: 20, height: 20 }, 'large')

    expect(tiny).not.toBeNull()
    for (const coordinate of (tiny ?? '').match(/-?\d+(\.\d+)?/g) ?? []) {
      const value = Number(coordinate)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(20)
    }
  })
})
