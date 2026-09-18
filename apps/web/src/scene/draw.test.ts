import { describe, expect, it } from 'vitest'

import { committedRect, constrainToAxis, drawnRect, DRAW_MIN_SIZE } from './draw.js'
import { GRID_SIZE } from './snapping.js'

const O = { x: 100, y: 100 }

describe('drawing an object to size', () => {
  it('sweeps a rectangle from the pointer down to the pointer now', () => {
    expect(drawnRect(O, { x: 260, y: 220 }, false)).toEqual({
      x: 100,
      y: 100,
      width: 160,
      height: 120,
    })
  })

  /**
   * The origin is where the pointer went down, NOT the top-left corner. Drawing
   * up and to the left is how half of all shapes get made, and a rect with a
   * negative width is invisible rather than merely wrong.
   */
  it('works in every direction', () => {
    expect(drawnRect(O, { x: 40, y: 30 }, false)).toEqual({
      x: 40,
      y: 30,
      width: 60,
      height: 70,
    })
  })

  describe('with Shift held', () => {
    it('forces equal sides', () => {
      const rect = drawnRect(O, { x: 260, y: 220 }, true)
      expect(rect.width).toBe(rect.height)
    })

    /** Covering the gesture, rather than shrinking inside it. */
    it('takes the longer side, not the shorter', () => {
      expect(drawnRect(O, { x: 260, y: 220 }, true).width).toBe(160)
    })

    it('still extends the way the pointer went', () => {
      const rect = drawnRect(O, { x: 40, y: 20 }, true)
      // 80 across, 60 down → an 80 square ending AT the origin corner.
      expect(rect).toEqual({ x: 20, y: 20, width: 80, height: 80 })
    })
  })

  describe('committing', () => {
    /**
     * Draw-to-size must not take click-to-place away. A user who selects the
     * shape tool and clicks still gets the type's own default size, and a hand
     * tremor must not produce a three-pixel object they cannot find or grab.
     */
    it('refuses a gesture too small to be a drag', () => {
      expect(committedRect(O, { x: 103, y: 102 }, false, true)).toBeNull()
      expect(committedRect(O, { x: 100 + DRAW_MIN_SIZE - 1, y: 300 }, false, false)).toBeNull()
    })

    /**
     * Both edges are snapped, not the origin and the size separately. Snapping
     * a corner and then a width leaves the far edge off-grid, which shows up
     * the moment two drawn shapes are supposed to line up with each other.
     */
    it('snaps both edges to the grid', () => {
      const rect = committedRect({ x: 103, y: 107 }, { x: 241, y: 198 }, false, true)
      expect(rect).not.toBeNull()
      if (rect === null) return
      for (const edge of [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height]) {
        expect(edge % GRID_SIZE).toBe(0)
      }
    })

    it('leaves a shape at least one grid cell across', () => {
      const rect = committedRect({ x: 101, y: 101 }, { x: 110, y: 110 }, false, true)
      expect(rect?.width).toBeGreaterThanOrEqual(GRID_SIZE)
      expect(rect?.height).toBeGreaterThanOrEqual(GRID_SIZE)
    })

    it('leaves the rect alone when snapping is off', () => {
      expect(committedRect({ x: 103, y: 107 }, { x: 241, y: 198 }, false, false)).toEqual({
        x: 103,
        y: 107,
        width: 138,
        height: 91,
      })
    })
  })
})

describe('holding a connector to an axis', () => {
  const from = { x: 100, y: 100 }

  it('takes the horizontal when the pointer went further across', () => {
    expect(constrainToAxis(from, { x: 260, y: 140 })).toEqual({ x: 260, y: 100 })
  })

  it('takes the vertical when the pointer went further down', () => {
    expect(constrainToAxis(from, { x: 140, y: 260 })).toEqual({ x: 100, y: 260 })
  })

  it('works backwards as well as forwards', () => {
    expect(constrainToAxis(from, { x: -50, y: 120 })).toEqual({ x: -50, y: 100 })
  })

  /**
   * Re-decided every frame rather than locked at the start. A user who begins
   * sideways and ends up heading down means the vertical, and a tool that
   * locked the first axis would fight them for the rest of the gesture.
   */
  it('changes axis when the gesture does', () => {
    expect(constrainToAxis(from, { x: 130, y: 110 }).y).toBe(100)
    expect(constrainToAxis(from, { x: 130, y: 400 }).x).toBe(100)
  })
})
