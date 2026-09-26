import { describe, expect, it } from 'vitest'

import { readingOrder } from './reading-order.js'

const at = (id: string, x: number, y: number) => ({ id, x, y })

describe('reading order', () => {
  it('reads rows top to bottom, and each row left to right', () => {
    expect(readingOrder([at('c', 0, 200), at('b', 300, 0), at('a', 0, 0)], 40)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  /*
   * Rounding into fixed 40-unit buckets put two notes two units apart in
   * different rows when they straddled a bucket's edge, so the right-hand one
   * came first. A row is objects close to one another, not a grid band.
   */
  it('keeps nearby tops in one row wherever they fall', () => {
    expect(readingOrder([at('right', 300, 19), at('left', 0, 21)], 40)).toEqual(['left', 'right'])
  })

  it('starts a new row once the gap is wider than the band', () => {
    expect(readingOrder([at('low', 0, 60), at('high', 300, 0)], 40)).toEqual(['high', 'low'])
  })
})
