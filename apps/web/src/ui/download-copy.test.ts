import { describe, expect, it } from 'vitest'

import { copyOfRecord } from './download-copy.js'

describe('a copy of a stored record', () => {
  it('is the record exactly, when JSON can spell it', () => {
    const record = { board: { meta: { title: 'Pricing' }, objects: [1, 2] } }
    const copy = copyOfRecord(record)
    expect(copy.exact).toBe(true)
    expect(JSON.parse(copy.text)).toEqual(record)
  })

  /*
   * IndexedDB stores by structured clone, which keeps what JSON cannot. The
   * copy used to throw on these, and the only way out of an unreadable board
   * produced nothing.
   */
  it('still comes out when the record holds a BigInt or refers to itself', () => {
    const board: Record<string, unknown> = { size: 10n }
    board.self = board
    const copy = copyOfRecord({ board })
    expect(copy.exact).toBe(false)
    expect(JSON.parse(copy.text)).toEqual({ board: { size: { $bigint: '10' }, self: '$cycle' } })
  })
})
