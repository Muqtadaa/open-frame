import { describe, expect, it } from 'vitest'

import {
  MAX_COLUMNS,
  TableDataSchema,
  cellIndex,
  emptyCells,
  cellRange,
  cellRegion,
  dividerPositions,
  styleCells,
  MIN_TRACK,
  resizeTrackAt,
  setTrackSize,
  type TableData,
} from './schema.js'
import { resizeGrid } from './grid.js'
import { plainTextOf } from '../../domain/rich-text.js'

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

/**
 * Adding and removing columns and rows.
 *
 * The trap this suite exists for: a ROW is contiguous in the flat cell list
 * and a COLUMN is not. Anything that treats them the same way works for one
 * and silently scrambles the other, and a 2x2 cannot tell them apart.
 */
const filled = (columns: number, rows: number): TableData => ({
  columns: Array.from({ length: columns }, () => 1),
  rows: Array.from({ length: rows }, () => 1),
  // Each cell labelled by where it is, so a scramble is visible rather than
  // merely possible.
  cells: Array.from({ length: columns * rows }, (_unused, index) => ({
    text: [{ text: `c${String(index % columns)}r${String(Math.floor(index / columns))}` }],
  })),
  headerRow: true,
})

const at = (data: TableData, column: number, row: number): string =>
  data.cells[cellIndex(data, column, row)]?.text[0]?.text ?? ''

describe('changing a table’s shape', () => {
  it('adds a column and keeps every cell where it was', () => {
    const before = filled(3, 2)
    const after = resizeGrid(before, 'column', 1)

    expect(after.columns).toHaveLength(4)
    expect(after.cells).toHaveLength(8)
    // Every original cell still reads its own name at its own coordinates.
    for (let row = 0; row < 2; row++) {
      for (let column = 0; column < 3; column++) {
        expect(at(after, column, row)).toBe(`c${String(column)}r${String(row)}`)
      }
    }
    // And the new column is empty.
    expect(at(after, 3, 0)).toBe('')
  })

  it('adds a row and keeps every cell where it was', () => {
    const after = resizeGrid(filled(3, 2), 'row', 1)

    expect(after.rows).toHaveLength(3)
    expect(after.cells).toHaveLength(9)
    expect(at(after, 2, 1)).toBe('c2r1')
    expect(at(after, 0, 2)).toBe('')
  })

  /**
   * The one that a slice would get wrong. Removing the last COLUMN of a 3x2
   * means dropping entries 2 and 5, not the last two.
   */
  it('removes a column without scrambling the rest', () => {
    const after = resizeGrid(filled(3, 2), 'column', -1)

    expect(after.columns).toHaveLength(2)
    expect(after.cells).toHaveLength(4)
    expect(at(after, 0, 0)).toBe('c0r0')
    expect(at(after, 1, 0)).toBe('c1r0')
    expect(at(after, 0, 1)).toBe('c0r1')
    expect(at(after, 1, 1)).toBe('c1r1')
  })

  it('removes a row', () => {
    const after = resizeGrid(filled(3, 2), 'row', -1)

    expect(after.rows).toHaveLength(1)
    expect(after.cells).toHaveLength(3)
    expect(at(after, 2, 0)).toBe('c2r0')
  })

  it('refuses to remove the last column or row', () => {
    const one = filled(1, 1)
    expect(resizeGrid(one, 'column', -1)).toBe(one)
    expect(resizeGrid(one, 'row', -1)).toBe(one)
  })

  it('refuses to grow past the maximum', () => {
    const wide = filled(MAX_COLUMNS, 1)
    expect(resizeGrid(wide, 'column', 1)).toBe(wide)
  })

  /**
   * A new column is as wide as the one beside it (ADR 0015). On a table whose
   * columns have been resized, a weight of 1 beside weights of 40 would be a
   * column too thin to see — and copying the neighbour is what a spreadsheet
   * does, like the rest of what a new track inherits.
   */
  it('gives a new column the width of the one beside it', () => {
    const uneven: TableData = { ...filled(2, 1), columns: [40, 20] }
    const after = resizeGrid(uneven, 'column', 1)
    expect(after.columns[2]).toBe(20)
  })

  it('always produces a table its own schema accepts', () => {
    let data = filled(3, 2)
    for (const step of [['column', 1], ['row', 1], ['column', -1], ['row', -1]] as const) {
      data = resizeGrid(data, step[0], step[1])
      expect(TableDataSchema.safeParse(data).success, `${step[0]} ${String(step[1])}`).toBe(true)
    }
  })
})

describe('the divisions inside a table', () => {
  it('sits between the tracks, not at the outer edges', () => {
    // Three columns have two boundaries: the object's own edges are not dividers.
    expect(dividerPositions([1, 1, 1])).toEqual([1 / 3, 2 / 3])
    expect(dividerPositions([1])).toEqual([])
  })

  it('reads uneven weights, not just even ones', () => {
    expect(dividerPositions([3, 1])).toEqual([0.75])
  })
})

describe('cellRange', () => {
  const three = grid(3, 3) as TableData

  it('takes one cell when both corners are the same', () => {
    expect(cellRange(three, 4, 4)).toEqual([4])
  })

  /**
   * A rectangle, not a run. Indices 1 to 7 on a 3x3 is the middle COLUMN plus
   * its neighbours, not "every cell between them in reading order" — the
   * difference is what makes this a spreadsheet selection rather than a text
   * one, and a flat-list implementation gets it wrong by default.
   */
  it('covers the rectangle between two corners, not the run', () => {
    expect(cellRange(three, 1, 7)).toEqual([1, 4, 7])
    expect(cellRange(three, 0, 4)).toEqual([0, 1, 3, 4])
  })

  /** Half of all drags go up or left. */
  it('normalises corners given in any order', () => {
    expect(cellRange(three, 8, 0)).toEqual(cellRange(three, 0, 8))
    expect(cellRange(three, 2, 6)).toEqual(cellRange(three, 6, 2))
    expect(cellRange(three, 2, 6)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })

  /** On a non-square grid, so a row/column mix-up cannot pass. */
  it('reads width from the columns, not from a square assumption', () => {
    const wide = grid(4, 2) as TableData
    expect(cellRange(wide, 0, 5)).toEqual([0, 1, 4, 5])
  })

  it('takes nothing when a corner is not on the grid', () => {
    expect(cellRange(three, 0, 99)).toEqual([])
    expect(cellRange(three, -1, 0)).toEqual([])
  })
})

describe('a cell\'s own alignment', () => {
  const three = grid(3, 3) as TableData

  it('is set and cleared per cell, beside its colours', () => {
    const aligned = styleCells(three, [4], { align: 'end', verticalAlign: 'bottom', fill: 'blue' })
    expect(aligned.cells[4]).toMatchObject({ align: 'end', verticalAlign: 'bottom', fill: 'blue' })
    expect(aligned.cells[3]?.align).toBeUndefined()

    const back = styleCells(aligned, [4], { align: null, verticalAlign: null })
    expect('align' in (back.cells[4] ?? {})).toBe(false)
    expect('verticalAlign' in (back.cells[4] ?? {})).toBe(false)
    expect(back.cells[4]?.fill).toBe('blue')
  })

  it('is accepted at the boundary, and nothing but the tokens is', () => {
    const cells = three.cells.map((cell, index) =>
      index === 0 ? { ...cell, align: 'center', verticalAlign: 'middle' } : cell,
    )
    expect(TableDataSchema.safeParse({ ...three, cells }).success).toBe(true)
    const wrong = three.cells.map((cell, index) =>
      index === 0 ? { ...cell, align: 'justify' } : cell,
    )
    expect(TableDataSchema.safeParse({ ...three, cells: wrong }).success).toBe(false)
  })
})

describe('styleCells', () => {
  const three = grid(3, 3) as TableData

  it('dresses only the cells named', () => {
    const styled = styleCells(three, [1, 2], { fill: 'blue' })
    expect(styled.cells[1]?.fill).toBe('blue')
    expect(styled.cells[2]?.fill).toBe('blue')
    expect(styled.cells[0]?.fill).toBeUndefined()
  })

  it('leaves the colours it was not asked about', () => {
    const first = styleCells(three, [0], { fill: 'blue' })
    const second = styleCells(first, [0], { textColor: '#123456' })
    expect(second.cells[0]).toEqual({
      text: [{ text: '' }],
      fill: 'blue',
      textColor: '#123456',
    })
  })

  /**
   * `null` CLEARS, `undefined` means "not mentioned". Without two spellings,
   * putting a cell back to the table's own colour is unreachable — there is no
   * token for "the default" and setting one would stop the cell following the
   * table.
   */
  it('clears a colour with null and leaves it alone with undefined', () => {
    const blue = styleCells(three, [0], { fill: 'blue', textColor: 'red' })
    const cleared = styleCells(blue, [0], { fill: null })
    expect('fill' in (cleared.cells[0] ?? {})).toBe(false)
    expect(cleared.cells[0]?.textColor).toBe('red')
  })

  it('never touches the text', () => {
    const typed: TableData = {
      ...three,
      cells: three.cells.map((cell, index) => ({ ...cell, text: [{ text: `c${String(index)}` }] })),
    }
    const styled = styleCells(typed, [0, 4, 8], { fill: 'green' })
    expect(styled.cells.map((cell) => plainTextOf(cell.text))).toEqual(
      typed.cells.map((cell) => plainTextOf(cell.text)),
    )
  })

  it('is a no-op for an empty selection, returning the same table', () => {
    expect(styleCells(three, [], { fill: 'blue' })).toBe(three)
  })

  /** What it produces has to be a table the document will accept. */
  it('produces data the schema accepts, and refuses a colour that is not one', () => {
    const styled = styleCells(three, [0], { fill: '#abcdef' })
    expect(TableDataSchema.safeParse(styled).success).toBe(true)
    expect(
      TableDataSchema.safeParse(styleCells(three, [0], { fill: 'chartreuse' as never })).success,
    ).toBe(false)
  })
})

describe('cellRegion', () => {
  const three = grid(3, 3) as TableData

  it('is the fraction of the table one cell occupies', () => {
    expect(cellRegion(three, [0])).toEqual({ x: 0, y: 0, width: 1 / 3, height: 1 / 3 })
    expect(cellRegion(three, [8])).toEqual({ x: 2 / 3, y: 2 / 3, width: 1 / 3, height: 1 / 3 })
  })

  it('bounds a rectangle of cells', () => {
    expect(cellRegion(three, [0, 1, 3, 4])).toEqual({ x: 0, y: 0, width: 2 / 3, height: 2 / 3 })
  })

  /**
   * WEIGHTED, not counted. A table whose first column is three times the
   * others puts its second column at three quarters across, and a control
   * anchored by cell COUNT would point at the middle of the first one.
   */
  it('reads the weights rather than assuming equal tracks', () => {
    const uneven: TableData = { ...three, columns: [3, 1, 1] }
    const region = cellRegion(uneven, [1])
    expect(region?.x).toBeCloseTo(0.6, 10)
    expect(region?.width).toBeCloseTo(0.2, 10)
  })

  it('has no rectangle for no cells', () => {
    expect(cellRegion(three, [])).toBeNull()
  })
})

describe('resizeTrackAt', () => {
  // Three columns, equal, in a 300-unit table: 100 each.
  const equal = [1, 1, 1]

  it('sets the dragged track to the size the pointer asks for', () => {
    // The first boundary dragged to half way: column 0 becomes 150.
    expect(resizeTrackAt(equal, 0, 0.5, 300)?.weights[0]).toBeCloseTo(150, 6)
  })

  /**
   * THE WHOLE POINT. Widening one column used to narrow its neighbour, so a
   * table could only ever rearrange the width it already had.
   */
  it('leaves every other track exactly as it was, and grows the table', () => {
    const moved = resizeTrackAt(equal, 0, 0.5, 300)
    expect(moved?.weights[1]).toBeCloseTo(100, 6)
    expect(moved?.weights[2]).toBeCloseTo(100, 6)
    expect(moved?.total).toBeCloseTo(350, 6)
  })

  it('shrinks the table when a track is made narrower', () => {
    const moved = resizeTrackAt(equal, 0, 0.2, 300)
    expect(moved?.weights[0]).toBeCloseTo(60, 6)
    expect(moved?.weights[1]).toBeCloseTo(100, 6)
    expect(moved?.total).toBeCloseTo(260, 6)
  })

  /**
   * A middle boundary moves the track BEFORE it, and on four columns rather
   * than three — on three, "everything after" is a single track and a change
   * that spread across the rest would be hard to tell from one that did not.
   */
  it('moves the track before the boundary and nothing after it', () => {
    const moved = resizeTrackAt([1, 1, 1, 1], 1, 0.75, 400)
    expect(moved?.weights[0]).toBeCloseTo(100, 6)
    expect(moved?.weights[1]).toBeCloseTo(200, 6)
    expect(moved?.weights[2]).toBeCloseTo(100, 6)
    expect(moved?.weights[3]).toBeCloseTo(100, 6)
  })

  /**
   * A track of no width is one nothing can be typed into and nothing can be
   * grabbed to drag back, so the drag stops at the limit. Absolute now, not a
   * share: a share of a wide table is still too small to use.
   */
  it('stops at the narrowest a track may be', () => {
    const moved = resizeTrackAt(equal, 0, 0, 300)
    expect(moved?.weights[0]).toBe(MIN_TRACK)
    expect(moved?.weights[1]).toBeCloseTo(100, 6)
    expect(moved?.total).toBeCloseTo(MIN_TRACK + 200, 6)
  })

  it('reads the existing sizes from the weights rather than assuming even ones', () => {
    const moved = resizeTrackAt([3, 1], 0, 0.5, 400)
    expect(moved?.weights[0]).toBeCloseTo(200, 6)
    expect(moved?.weights[1]).toBeCloseTo(100, 6)
    expect(moved?.total).toBeCloseTo(300, 6)
  })

  it('refuses a boundary that is not there', () => {
    expect(resizeTrackAt(equal, 9, 0.5, 300)).toBeNull()
    expect(resizeTrackAt(equal, 0, 0.5, 0)).toBeNull()
  })

  it('produces weights the schema accepts', () => {
    const moved = resizeTrackAt(equal, 0, 0.5, 300)
    expect(TableDataSchema.safeParse(grid(3, 1, { columns: moved?.weights ?? [] })).success).toBe(
      true,
    )
  })
})

describe('setTrackSize', () => {
  it('sets one track to an exact size and leaves the rest', () => {
    const sized = setTrackSize([1, 1, 1], 1, 220, 300)
    expect(sized?.weights).toEqual([100, 220, 100])
    expect(sized?.total).toBe(420)
  })

  it('will not go below the floor, however small the measurement', () => {
    expect(setTrackSize([1, 1], 0, 2, 200)?.weights[0]).toBe(MIN_TRACK)
  })
})
