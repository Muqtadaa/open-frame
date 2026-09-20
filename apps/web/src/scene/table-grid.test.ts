import { describe, expect, it } from 'vitest'

import { rect, type TableData } from '@openframe/core'

import { cellAt, tracks } from './table-grid.js'

const grid = (columns: readonly number[], rows: readonly number[]): TableData => ({
  columns: [...columns],
  rows: [...rows],
  cells: Array.from({ length: columns.length * rows.length }, () => ({ text: [{ text: '' }] })),
  headerRow: true,
})

describe('the cell under a point', () => {
  const even = grid([1, 1, 1], [1, 1])
  const box = rect(100, 100, 300, 200)

  it('finds the first cell at the top left', () => {
    expect(cellAt(even, box, { x: 110, y: 110 })).toEqual({ column: 0, row: 0 })
  })

  it('finds the last cell at the bottom right', () => {
    expect(cellAt(even, box, { x: 390, y: 290 })).toEqual({ column: 2, row: 1 })
  })

  it('finds a cell in the middle', () => {
    expect(cellAt(even, box, { x: 250, y: 110 })).toEqual({ column: 1, row: 0 })
  })

  /**
   * The case equal weights cannot tell apart. With [1,1,1] every boundary is
   * where a naive thirds calculation puts it too, so an UNEVEN table is the
   * only one that proves the weights are being read.
   */
  it('honours uneven weights', () => {
    const uneven = grid([3, 1], [1, 1])
    // Three quarters across: inside the first column, which owns 75%.
    expect(cellAt(uneven, box, { x: 100 + 300 * 0.7, y: 110 })?.column).toBe(0)
    // Past it: the second column, which owns the last quarter.
    expect(cellAt(uneven, box, { x: 100 + 300 * 0.8, y: 110 })?.column).toBe(1)
  })

  it('is nothing at all outside the table', () => {
    expect(cellAt(even, box, { x: 50, y: 110 })).toBeNull()
    expect(cellAt(even, box, { x: 110, y: 400 })).toBeNull()
  })

  /**
   * A degenerate frame has no cells to be inside of, and dividing by its width
   * would produce an Infinity that `slot` would then compare against.
   */
  it('survives a frame with no extent', () => {
    expect(cellAt(even, rect(0, 0, 0, 200), { x: 0, y: 10 })).toBeNull()
  })
})

describe('grid tracks', () => {
  it('turns weights into fr units', () => {
    expect(tracks([1, 2, 1])).toBe('1fr 2fr 1fr')
  })
})
