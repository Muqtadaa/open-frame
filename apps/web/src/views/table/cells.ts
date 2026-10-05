import { mergeAt, type TableData } from '@openframe/core'

/*
 * Cells as the editor addresses them: by row and column, stepping over merges.
 */

export interface Cell {
  readonly row: number
  readonly col: number
}

/** The column's letter, as a spreadsheet names it. Twenty-six is the most. */
export const letter = (col: number): string => String.fromCharCode(65 + col)

/** The top-left of whatever merge a cell is in, or the cell itself. */
export function anchorOf(data: TableData, cell: Cell): Cell {
  const merge = mergeAt(data, cell.row, cell.col)
  return merge === undefined ? cell : { row: merge.row, col: merge.col }
}

/**
 * One step from a cell, stepping OVER a merge rather than into its middle —
 * moving right out of a cell three columns wide lands in the fourth column,
 * as it looks like it should.
 */
export function step(data: TableData, from: Cell, rows: number, cols: number): Cell {
  const merge = mergeAt(data, from.row, from.col)
  const top = merge?.row ?? from.row
  const left = merge?.col ?? from.col
  const bottom = merge === undefined ? from.row : merge.row + merge.rows - 1
  const right = merge === undefined ? from.col : merge.col + merge.cols - 1
  const row = rows > 0 ? bottom + rows : rows < 0 ? top + rows : from.row
  const col = cols > 0 ? right + cols : cols < 0 ? left + cols : from.col
  return {
    row: Math.max(0, Math.min(data.rows.length - 1, row)),
    col: Math.max(0, Math.min(data.columns.length - 1, col)),
  }
}

/** What the user's selection is, and which end of it is moving. */
export interface Selection {
  readonly anchor: Cell
  readonly focus: Cell
}
