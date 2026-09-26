import { describe, expect, it } from 'vitest'

import { placeDerived } from './derived-placement.js'

describe('placeDerived', () => {
  const source = { x: 0, y: 200, width: 200, height: 100 }
  const size = { width: 100, height: 50 }
  const everywhere = { x: -10_000, y: -10_000, width: 20_000, height: 20_000 }

  it('goes above the source, centred, when that is free', () => {
    expect(placeDerived(source, size, [], everywhere, 80)).toEqual({ x: 50, y: 70 })
  })

  /*
   * Priya's board: clusters stacked one above another, so "above" was on top
   * of the next cluster up — the new claim hid the very evidence it sat over.
   */
  it('moves to the next side when above is taken', () => {
    const above = { x: 0, y: 0, width: 200, height: 150 }
    const at = placeDerived(source, size, [above], everywhere, 80)
    expect(at).toEqual({ x: 280, y: 225 })
  })

  // Placed where it is already in view, the camera has no reason to jump.
  it('prefers a free place that is already on screen', () => {
    const view = { x: -50, y: 150, width: 500, height: 300 }
    expect(placeDerived(source, size, [], view, 80)).toEqual({ x: 280, y: 225 })
  })

  it('steps further out when every side is taken', () => {
    const ring = [
      { x: 0, y: 70, width: 200, height: 50 },
      { x: 280, y: 200, width: 100, height: 100 },
      { x: 0, y: 380, width: 200, height: 50 },
      { x: -180, y: 200, width: 100, height: 100 },
    ]
    const at = placeDerived(source, size, ring, everywhere, 80)
    expect(at).toEqual({ x: 50, y: -60 })
  })

  it('falls back to above when nothing is free', () => {
    const all = [everywhere]
    expect(placeDerived(source, size, all, everywhere, 80)).toEqual({ x: 50, y: 70 })
  })
})
