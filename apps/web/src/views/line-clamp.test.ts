import { describe, expect, it } from 'vitest'

import { linesThatFit } from './line-clamp.js'

describe('the line count a clipped text is clamped to', () => {
  it('is how many whole lines fit', () => {
    expect(linesThatFit(100, 20)).toBe(5)
    expect(linesThatFit(99, 20)).toBe(4)
  })

  it('counts a box the layout rounded a hair under as the lines it holds', () => {
    expect(linesThatFit(3 * 18.9 - 0.001, 18.9)).toBe(3)
  })

  it('never clamps to nothing, which the property reads as no clamp at all', () => {
    expect(linesThatFit(4, 20)).toBe(1)
    expect(linesThatFit(0, 20)).toBe(1)
    expect(linesThatFit(100, 0)).toBe(1)
    expect(linesThatFit(100, Number.NaN)).toBe(1)
  })
})
