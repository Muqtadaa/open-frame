import { describe, expect, it } from 'vitest'

import { placeAnchored, type AnchorRequest } from './anchoring.js'

const base: AnchorRequest = {
  anchor: { x: 400, y: 300, width: 200, height: 100 },
  surface: { width: 300, height: 200 },
  within: { width: 1400, height: 900 },
  prefer: ['right', 'left', 'below', 'above'],
  gap: 10,
  margin: 12,
}

describe('placeAnchored', () => {
  it('takes the first preferred side that fits', () => {
    expect(placeAnchored(base)).toEqual({ x: 610, y: 300, side: 'right' })
  })

  it('falls through to the next side when the first does not fit', () => {
    // Hard against the right edge: no room on the right, plenty on the left.
    const placed = placeAnchored({ ...base, anchor: { ...base.anchor, x: 1100 } })
    expect(placed.side).toBe('left')
    expect(placed.x).toBe(1100 - 10 - 300)
  })

  it('honours the order it was given, not a fixed one', () => {
    expect(placeAnchored({ ...base, prefer: ['above', 'right'] }).side).toBe('above')
    expect(placeAnchored({ ...base, prefer: ['below', 'right'] }).side).toBe('below')
  })

  /**
   * The case both world-space bars got wrong: an anchor that is itself off the
   * top of the window. A surface pinned to it went with it.
   */
  it('keeps the surface on screen when the anchor is not', () => {
    const placed = placeAnchored({
      ...base,
      anchor: { x: 400, y: -800, width: 200, height: 100 },
      prefer: ['above', 'below'],
    })
    expect(placed.y).toBeGreaterThanOrEqual(12)
    expect(placed.y + 200).toBeLessThanOrEqual(900 - 12 + 0.001)
  })

  /**
   * Clamping runs on BOTH axes whichever side wins. Placed to the right of an
   * anchor near the bottom, the surface still has to be pushed up.
   */
  it('clamps the other axis too', () => {
    const placed = placeAnchored({ ...base, anchor: { ...base.anchor, y: 850 } })
    expect(placed.side).toBe('right')
    expect(placed.y).toBe(900 - 200 - 12)
  })

  it('never enters the band reserved for the rail', () => {
    const placed = placeAnchored({
      ...base,
      anchor: { x: 20, y: 300, width: 1340, height: 100 },
      keepClearLeft: 84,
    })
    expect(placed.x).toBeGreaterThanOrEqual(84)
  })

  /**
   * A window smaller than the surface has no placement that satisfies both
   * bounds. Pinning the top-left on screen is the one that keeps the surface's
   * controls reachable; clamping the other way puts its head off the window.
   */
  it('keeps the leading corner on screen when nothing can fit', () => {
    const placed = placeAnchored({
      ...base,
      surface: { width: 2000, height: 1600 },
      within: { width: 600, height: 400 },
    })
    expect(placed.x).toBe(12)
    expect(placed.y).toBe(12)
  })

  it('sits over the anchor when no side has room', () => {
    expect(
      placeAnchored({
        ...base,
        anchor: { x: 12, y: 12, width: 1376, height: 876 },
      }).side,
    ).toBe('over')
  })
})
