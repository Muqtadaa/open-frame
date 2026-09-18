import { describe, expect, it } from 'vitest'

import { GRID_SIZE, snapDelta, snapPoint, snapRect, snapValue } from './snapping.js'

describe('snapValue', () => {
  it('rounds to the nearest grid line', () => {
    expect(snapValue(4)).toBe(0)
    expect(snapValue(6)).toBe(10)
    expect(snapValue(-4)).toBe(-0)
    expect(snapValue(-6)).toBe(-10)
  })

  it('leaves values already on the grid alone', () => {
    expect(snapValue(120)).toBe(120)
  })

  it('honours a custom grid', () => {
    expect(snapValue(9, 4)).toBe(8)
  })
})

describe('snapPoint', () => {
  it('snaps both axes', () => {
    expect(snapPoint({ x: 13, y: 27 })).toEqual({ x: 10, y: 30 })
  })
})

/**
 * The property that makes multi-selection dragging feel right: every member
 * keeps its position relative to the others. Snapping each object on its own
 * would shuffle them apart.
 */
describe('snapDelta', () => {
  const bounds = { x: 100, y: 200, width: 50, height: 50 }

  it('produces a delta that lands the bounds on the grid', () => {
    const delta = snapDelta(bounds, { x: 13, y: 27 })
    expect(bounds.x + delta.x).toBe(110)
    expect(bounds.y + delta.y).toBe(230)
  })

  it('is a no-op when already aligned and moving by whole cells', () => {
    expect(snapDelta(bounds, { x: 20, y: 30 })).toEqual({ x: 20, y: 30 })
  })

  it('corrects bounds that were off-grid to begin with', () => {
    const off = { x: 103, y: 207, width: 50, height: 50 }
    const delta = snapDelta(off, { x: 0, y: 0 })
    expect(off.x + delta.x).toBe(100)
    expect(off.y + delta.y).toBe(210)
  })
})

describe('snapRect', () => {
  it('snaps all four edges', () => {
    expect(snapRect({ x: 3, y: 7, width: 44, height: 46 })).toEqual({
      x: 0,
      y: 10,
      width: 50,
      height: 40,
    })
  })

  it('never collapses below one grid cell', () => {
    const snapped = snapRect({ x: 0, y: 0, width: 2, height: 2 })
    expect(snapped.width).toBe(GRID_SIZE)
    expect(snapped.height).toBe(GRID_SIZE)
  })

  it('leaves an aligned rect unchanged', () => {
    const aligned = { x: 20, y: 30, width: 100, height: 60 }
    expect(snapRect(aligned)).toEqual(aligned)
  })
})
