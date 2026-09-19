import { describe, expect, it } from 'vitest'

import { rect } from '@openframe/core'

import { pinFraction, pinPosition, type PinnedComment } from './comment-pin.js'

/**
 * A pin that does not ride its element is the bug this file exists to prevent,
 * and it is invisible in any test whose element never moves.
 */
const anchored = (fx: number, fy: number): PinnedComment => ({ x: 10, y: 20, fx, fy })
const loose = (x: number, y: number): PinnedComment => ({ x, y, fx: null, fy: null })

describe('where a pin belongs', () => {
  it('rides its element across a move', () => {
    const comment = anchored(0.5, 0.5)
    const before = pinPosition(comment, rect(100, 100, 40, 20))
    const after = pinPosition(comment, rect(300, 180, 40, 20))

    expect(before).toEqual({ x: 120, y: 110 })
    expect(after).toEqual({ x: 320, y: 190 })
    // Stated rather than implied: the whole point is that these DIFFER.
    expect(after).not.toEqual(before)
  })

  /**
   * The case a fixed offset from the corner gets wrong.
   *
   * A pin on the right-hand edge of a note has to stay on the right-hand edge
   * when the note is widened. An offset would leave it floating in the middle,
   * and the test for a move alone would never notice.
   */
  it('stays on the same part of its element across a resize', () => {
    const comment = anchored(1, 0)
    expect(pinPosition(comment, rect(0, 0, 100, 50))).toEqual({ x: 100, y: 0 })
    expect(pinPosition(comment, rect(0, 0, 400, 50))).toEqual({ x: 400, y: 0 })
  })

  it('falls back to where it was dropped when its element is gone', () => {
    expect(pinPosition(anchored(0.5, 0.5), null)).toEqual({ x: 10, y: 20 })
  })

  it('uses its own coordinates when it was never on an element', () => {
    expect(pinPosition(loose(7, 9), rect(500, 500, 10, 10))).toEqual({ x: 7, y: 9 })
  })

  it('is nowhere at all when it is a reply', () => {
    expect(pinPosition({ x: null, y: null, fx: null, fy: null }, null)).toBeNull()
  })

  /**
   * Half an anchor is not an anchor. The database refuses to store one, so
   * this is about a row that arrived some other way — which is exactly the
   * kind of row a reader is a boundary for.
   */
  it('ignores an anchor with only one half', () => {
    expect(pinPosition({ x: 10, y: 20, fx: 0.5, fy: null }, rect(0, 0, 100, 100))).toEqual({
      x: 10,
      y: 20,
    })
  })
})

describe('turning a click into an anchor', () => {
  it('measures the click as a proportion of the box', () => {
    expect(pinFraction({ x: 150, y: 125 }, rect(100, 100, 100, 50))).toEqual({ fx: 0.5, fy: 0.5 })
    expect(pinFraction({ x: 200, y: 100 }, rect(100, 100, 100, 50))).toEqual({ fx: 1, fy: 0 })
  })

  it('round-trips a click back to where it was made', () => {
    const box = rect(40, 60, 220, 90)
    const at = { x: 140, y: 100 }
    const { fx, fy } = pinFraction(at, box)
    expect(pinPosition({ x: 0, y: 0, fx, fy }, box)).toEqual(at)
  })

  /**
   * Hit testing is against an element's INK, and bounds are a superset of it —
   * so a click can be on a rotated shape and outside the box measured here.
   * Unclamped, that value is refused by the database's own check and the
   * comment is lost after it was typed.
   */
  it('clamps a click that landed outside the box', () => {
    expect(pinFraction({ x: -50, y: 500 }, rect(0, 0, 100, 100))).toEqual({ fx: 0, fy: 1 })
  })

  /**
   * A perfectly horizontal connector has no height at all, and is a thing
   * people comment on. Dividing by it yields NaN, and a NaN transform is one
   * the browser drops — taking the whole layer's rendering with it.
   */
  it('survives an element with no extent on one axis', () => {
    const line = rect(0, 100, 200, 0)
    const { fx, fy } = pinFraction({ x: 100, y: 100 }, line)
    expect(Number.isFinite(fx)).toBe(true)
    expect(Number.isFinite(fy)).toBe(true)
    expect(pinPosition({ x: 0, y: 0, fx, fy }, line)).toEqual({ x: 100, y: 100 })
  })
})
