import { describe, expect, it } from 'vitest'

import { resolveDragDelta } from './drag-delta.js'

/**
 * Where a dragged selection lands (rule 17), tested apart from the pointer.
 *
 * It lived inside the gesture hook, where only an end-to-end drag could reach
 * it. The neighbour here is deliberately OFF the grid: a test using only
 * grid-aligned positions cannot tell alignment from the grid, because both put
 * the object in the same place — three such tests once passed with the feature
 * deleted.
 */
const START = { x: 0, y: 0, width: 100, height: 100 }
const NEIGHBOUR = { x: 203, y: 500, width: 100, height: 100 }

describe('where a dragged selection lands', () => {
  it('lines up with a neighbour on the axis it is near, off the grid', () => {
    const landed = resolveDragDelta(START, [NEIGHBOUR], { x: 201, y: 57 }, true, 1)
    expect(landed.x).toBe(203)
    expect(landed.guides.length).toBeGreaterThan(0)
  })

  it('falls back to the grid on the axis nothing is near', () => {
    const landed = resolveDragDelta(START, [NEIGHBOUR], { x: 201, y: 57 }, true, 1)
    expect(landed.y).toBe(60)
  })

  it('snaps to the grid when no neighbour is close', () => {
    const landed = resolveDragDelta(START, [NEIGHBOUR], { x: 123, y: 57 }, true, 1)
    expect({ x: landed.x, y: landed.y }).toEqual({ x: 120, y: 60 })
  })

  it('does neither while snapping is suspended', () => {
    expect(resolveDragDelta(START, [NEIGHBOUR], { x: 201, y: 57 }, false, 1)).toEqual({
      x: 201,
      y: 57,
      guides: [],
    })
  })

  it('reaches a neighbour by screen pixels, not world units', () => {
    // Four world units off at 25% is one screen pixel: close enough.
    expect(resolveDragDelta(START, [NEIGHBOUR], { x: 199, y: 57 }, true, 0.25).x).toBe(203)
    // The same four at 400% is sixteen screen pixels: not close at all.
    expect(resolveDragDelta(START, [NEIGHBOUR], { x: 199, y: 57 }, true, 4).x).toBe(200)
  })
})
