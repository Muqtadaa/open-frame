import { describe, expect, it } from 'vitest'

import { solveExtent } from './fit-text.js'

/**
 * The arithmetic behind fitting an object to its text.
 *
 * Two samples rather than one, because two kinds of type are in play and a
 * single sample cannot tell them apart: a sticky note's padding is absolute
 * and a shape's label inset is a percentage of the shape. The DOM half of this
 * is covered by `e2e/text-overflow.spec.ts`, since a headless DOM lays nothing
 * out and would answer zero to every measurement.
 */
describe('solving for the frame that fits', () => {
  it('handles an absolute surround, like a sticky note', () => {
    // 13px of padding each side: box = frame - 26, whatever the frame is.
    const low = { frame: 180, box: 154 }
    const high = { frame: 360, box: 334 }
    expect(solveExtent(low, high, 300)).toBe(326)
  })

  it('handles a proportional surround, like a shape label', () => {
    // The label occupies 80% of the shape, so a box of 300 needs a frame of
    // 375 — NOT 300 plus the 40 the surround happens to measure right now.
    const low = { frame: 200, box: 160 }
    const high = { frame: 400, box: 320 }
    expect(solveExtent(low, high, 300)).toBe(375)
  })

  /*
   * The case that makes two samples necessary. Subtracting the surround
   * measured at the current size gives 340 for the proportional shape above,
   * which is 35 short — the text comes back still wrapped, and the gesture
   * looks like it half worked.
   */
  it('differs from subtracting the surround, which is the whole point', () => {
    const low = { frame: 200, box: 160 }
    const high = { frame: 400, box: 320 }
    const naive = low.frame + (300 - low.box)
    expect(naive).toBe(340)
    expect(solveExtent(low, high, 300)).not.toBe(naive)
  })

  it('refuses a box that does not follow its frame', () => {
    // A fixed-size box inside a resizable object: growing the object would
    // never make the text fit, so there is nothing honest to return.
    expect(solveExtent({ frame: 100, box: 50 }, { frame: 200, box: 50 }, 80)).toBeNull()
  })

  it('refuses two readings of the same size', () => {
    expect(solveExtent({ frame: 100, box: 80 }, { frame: 100, box: 80 }, 200)).toBeNull()
  })

  it('will not fit below a findable size or above a usable one', () => {
    expect(solveExtent({ frame: 100, box: 80 }, { frame: 200, box: 180 }, 1)).toBe(40)
    expect(solveExtent({ frame: 100, box: 80 }, { frame: 200, box: 180 }, 99_999)).toBe(2000)
  })
})
