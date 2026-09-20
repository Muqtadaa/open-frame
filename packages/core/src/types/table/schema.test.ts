import { describe, expect, it } from 'vitest'

import { TableDataSchema, cellIndex, emptyCells, type TableData } from './schema.js'

/**
 * The grid's shape lives in one place — the lengths of `columns` and `rows` —
 * and the cell list has to agree with it exactly. A table that disagreed with
 * itself would render holes or silently drop what somebody typed.
 */
const grid = (columns: number, rows: number, over: Partial<TableData> = {}): unknown => ({
  columns: Array.from({ length: columns }, () => 1),
  rows: Array.from({ length: rows }, () => 1),
  cells: emptyCells(columns * rows),
  headerRow: true,
  ...over,
})

describe('a table holds exactly the cells its shape implies', () => {
  it('accepts a grid whose cells fill it', () => {
    expect(TableDataSchema.safeParse(grid(3, 2)).success).toBe(true)
  })

  it('refuses one cell too few', () => {
    expect(TableDataSchema.safeParse(grid(3, 2, { cells: emptyCells(5) })).success).toBe(false)
  })

  it('refuses one cell too many', () => {
    expect(TableDataSchema.safeParse(grid(3, 2, { cells: emptyCells(7) })).success).toBe(false)
  })

  /**
   * The case a `length >= columns * rows` check would let through, and the
   * reason this is an equality: six cells is right for 3x2 and wrong for 2x3
   * only if the SHAPE is compared, not the total.
   */
  it('refuses a cell count that is right for a different shape', () => {
    const ragged = grid(3, 2, { cells: emptyCells(6) })
    expect(TableDataSchema.safeParse(ragged).success).toBe(true)
    expect(TableDataSchema.safeParse(grid(4, 2, { cells: emptyCells(6) })).success).toBe(false)
  })
})

describe('a weight is a real, positive number', () => {
  it('refuses a column of no width', () => {
    expect(TableDataSchema.safeParse(grid(2, 1, { columns: [1, 0] })).success).toBe(false)
  })

  it('refuses a weight that is not a number at all', () => {
    expect(TableDataSchema.safeParse(grid(2, 1, { columns: [1, Number.NaN] })).success).toBe(false)
  })

  it('refuses a table with no columns', () => {
    expect(TableDataSchema.safeParse(grid(0, 2, { cells: [] })).success).toBe(false)
  })
})

describe('finding a cell', () => {
  it('reads across the row, then down', () => {
    const data = grid(3, 2) as TableData
    expect(cellIndex(data, 0, 0)).toBe(0)
    expect(cellIndex(data, 2, 0)).toBe(2)
    expect(cellIndex(data, 0, 1)).toBe(3)
    expect(cellIndex(data, 2, 1)).toBe(5)
  })

  /**
   * Row-major, and the test says so with a NON-SQUARE grid. On a 3x3 the two
   * orderings agree at the corners and this would pass either way.
   */
  it('is row-major rather than column-major', () => {
    const wide = grid(4, 2) as TableData
    expect(cellIndex(wide, 1, 1)).toBe(5)
    expect(cellIndex(wide, 1, 1)).not.toBe(1 * 2 + 1)
  })
})
