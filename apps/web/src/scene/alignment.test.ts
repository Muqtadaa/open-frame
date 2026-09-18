import type { Rect } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { alignToNeighbours } from './alignment.js'

const rect = (x: number, y: number, width = 100, height = 50): Rect => ({ x, y, width, height })

const TOL = 8

describe('alignToNeighbours', () => {
  it('leaves the delta alone when nothing is near', () => {
    const result = alignToNeighbours(rect(0, 0), { x: 500, y: 500 }, [rect(0, 0)], TOL)
    expect(result.delta).toEqual({ x: 500, y: 500 })
    expect(result.guides).toEqual([])
    expect(result.snapped).toEqual({ x: false, y: false })
  })

  it('does nothing without neighbours', () => {
    const result = alignToNeighbours(rect(0, 0), { x: 3, y: 3 }, [], TOL)
    expect(result.delta).toEqual({ x: 3, y: 3 })
  })

  it('pulls a near-miss into left-edge alignment', () => {
    // Neighbour's left edge is at 200; dragging to 195 is within tolerance.
    const result = alignToNeighbours(rect(0, 0), { x: 195, y: 400 }, [rect(200, 300)], TOL)
    expect(result.delta.x).toBe(200)
    expect(result.snapped.x).toBe(true)
  })

  it('aligns centres, not just edges', () => {
    // Neighbour spans 200..300, so its centre is 250. A 100-wide box centred
    // there starts at 200 — but test a different width so only the centre matches.
    const moving = rect(0, 0, 40, 40)
    const result = alignToNeighbours(moving, { x: 233, y: 0 }, [rect(200, 0, 100, 40)], TOL)
    // 230 puts the moving centre (230 + 20) on 250.
    expect(result.delta.x).toBe(230)
  })

  it('aligns a right edge to a neighbour left edge', () => {
    const result = alignToNeighbours(rect(0, 0, 100, 50), { x: 97, y: 0 }, [rect(200, 0)], TOL)
    // Moving right edge lands on 200, so x becomes 100.
    expect(result.delta.x).toBe(100)
  })

  it('captures one axis while leaving the other free', () => {
    const result = alignToNeighbours(rect(0, 0), { x: 198, y: 777 }, [rect(200, 300)], TOL)
    expect(result.snapped).toEqual({ x: true, y: false })
    expect(result.delta.y).toBe(777)
  })

  it('takes the nearest candidate when two are in range', () => {
    const result = alignToNeighbours(
      rect(0, 0),
      { x: 199, y: 0 },
      [rect(205, 0), rect(200, 0)],
      TOL,
    )
    expect(result.delta.x).toBe(200)
  })

  /** Order must not decide the result, or a redraw could move the object. */
  it('is independent of the order neighbours are given in', () => {
    const neighbours = [rect(205, 0), rect(200, 0), rect(203, 0)]
    const forward = alignToNeighbours(rect(0, 0), { x: 199, y: 0 }, neighbours, TOL)
    const backward = alignToNeighbours(rect(0, 0), { x: 199, y: 0 }, [...neighbours].reverse(), TOL)
    expect(forward.delta).toEqual(backward.delta)
  })

  it('ignores a candidate just outside the tolerance', () => {
    const result = alignToNeighbours(rect(0, 0), { x: 191, y: 0 }, [rect(200, 0)], TOL)
    expect(result.delta.x).toBe(191)
    expect(result.snapped.x).toBe(false)
  })

  it('scales with tolerance, so a zoomed-out board does not grab from far away', () => {
    const far = alignToNeighbours(rect(0, 0), { x: 180, y: 0 }, [rect(200, 0)], 5)
    expect(far.snapped.x).toBe(false)
    const near = alignToNeighbours(rect(0, 0), { x: 180, y: 0 }, [rect(200, 0)], 25)
    expect(near.snapped.x).toBe(true)
  })

  describe('guides', () => {
    it('reports a vertical line at the shared edge', () => {
      const result = alignToNeighbours(rect(0, 0), { x: 197, y: 300 }, [rect(200, 300)], TOL)
      const guide = result.guides.find((g) => g.axis === 'x')
      expect(guide?.position).toBe(200)
    })

    /**
     * Two rectangles of the SAME width that line up on one edge line up on all
     * three stops, so three guides is correct rather than duplication.
     */
    it('reports every stop that coincides, not just the nearest', () => {
      const result = alignToNeighbours(rect(0, 0, 180, 180), { x: 200, y: 0 }, [rect(200, 400, 180, 180)], TOL)
      const verticals = result.guides.filter((g) => g.axis === 'x').map((g) => g.position)
      expect(verticals.sort((a, b) => a - b)).toEqual([200, 290, 380])
    })

    /** Three boxes on one line is ONE guide spanning them, not three segments. */
    it('spans every rectangle that shares the line', () => {
      const result = alignToNeighbours(
        rect(0, 0, 100, 50),
        { x: 200, y: 600 },
        [rect(200, 100, 100, 50), rect(200, 900, 100, 50)],
        TOL,
      )
      const guide = result.guides.find((g) => g.axis === 'x' && g.position === 200)
      expect(guide).toBeDefined()
      expect(guide?.start).toBe(100)
      expect(guide?.end).toBe(950)
    })

    it('emits no guides on an axis that did not capture', () => {
      const result = alignToNeighbours(rect(0, 0), { x: 900, y: 900 }, [rect(200, 300)], TOL)
      expect(result.guides).toEqual([])
    })

    it('does not repeat a line when several neighbours share it', () => {
      const result = alignToNeighbours(
        rect(0, 0),
        { x: 200, y: 0 },
        [rect(200, 100), rect(200, 300), rect(200, 500)],
        TOL,
      )
      const verticals = result.guides.filter((g) => g.axis === 'x' && g.position === 200)
      expect(verticals).toHaveLength(1)
    })
  })
})

/**
 * Real drags produce coordinates like 412.7333333333333, not the tidy integers
 * above. A guide must still be reported when the arithmetic is messy.
 */
describe('guides on fractional coordinates', () => {
  it('still reports a guide when the arithmetic does not land on clean numbers', () => {
    const moving = rect(12.3333333, 7.77777, 101.5, 49.25)
    const neighbour = rect(200.6666667, 300.125, 97.3, 51.75)
    const raw = { x: 186.1, y: 291.2 }

    const result = alignToNeighbours(moving, raw, [neighbour], TOL)

    expect(result.snapped.x || result.snapped.y).toBe(true)
    expect(result.guides.length).toBeGreaterThan(0)
  })

  it('reports a guide for a centre alignment on thirds', () => {
    const moving = rect(0, 0, 100 / 3, 50)
    const neighbour = rect(200 / 3, 0, 100 / 3, 50)
    // Line the two centres up from just off.
    const raw = { x: 200 / 3 - 0.4, y: 0 }

    const result = alignToNeighbours(moving, raw, [neighbour], TOL)
    expect(result.snapped.x).toBe(true)
    expect(result.guides.some((g) => g.axis === 'x')).toBe(true)
  })
})
