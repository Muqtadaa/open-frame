import { type ZodType, z } from 'zod'

import { RichTextSchema, type RichText } from '../../domain/rich-text.js'

/**
 * A grid, held by ONE object.
 *
 * Rows and columns live in the table's own data rather than as child objects.
 * A container of cells would be more powerful — a cell could carry its own
 * comment or connector endpoint — and far more expensive: a 20x20 table is 400
 * objects, and culling asks every visible object for its bounds on every
 * frame. Rule 10 exists because a container that resolved its own children
 * cost 9.6ms per cull against a 16.7ms budget.
 *
 * The accepted cost is stated plainly: a cell is not addressable from outside
 * the table. Anything that wants to point AT a cell points at the table.
 */

/** One cell's contents. Rich text, like every other text this product holds. */
export interface TableCell {
  readonly text: RichText
}

export interface TableData {
  /**
   * Column and row WEIGHTS, not absolute sizes.
   *
   * The frame stays the authority for how big the table is, and these decide
   * how it is divided. Absolute sizes would make the frame a second opinion
   * about the same thing — and `resizable` would be a capability the type
   * declared and then ignored, which is the exact failure rule 21 was written
   * about.
   *
   * Their COUNT is the shape of the grid. There is no separate row or column
   * number to disagree with them: a table with three weights has three
   * columns, and that cannot drift.
   */
  readonly columns: readonly number[]
  readonly rows: readonly number[]
  /**
   * Cells in reading order: row 0 left to right, then row 1, and so on.
   *
   * A flat list rather than nested arrays because a patch addresses one index
   * — editing a cell is `cells.4`, not a path through two levels that a CRDT
   * would have to merge structurally. Its length is always rows x columns, and
   * the schema refuses anything else rather than letting a ragged table into
   * the document.
   */
  readonly cells: readonly TableCell[]
  /** Whether the first row is a header. Presentation, not structure. */
  readonly headerRow: boolean
}

export const TABLE_VERSION = 1

/** The most a table may hold. Past this it is a spreadsheet, not a board. */
export const MAX_COLUMNS = 26
export const MAX_ROWS = 200

/**
 * A weight: real, positive, and bounded.
 *
 * Zero is refused rather than clamped. A column of no width is one nothing can
 * be typed into and nothing can be grabbed to resize — it would be a column
 * that exists in the data and not on the board.
 */
const WeightSchema = z.number().finite().min(0.01).max(1000)

const TableCellSchema: ZodType<TableCell> = z.object({
  text: RichTextSchema,
})

export const TableDataSchema: ZodType<TableData> = z
  .object({
    columns: z.array(WeightSchema).min(1).max(MAX_COLUMNS),
    rows: z.array(WeightSchema).min(1).max(MAX_ROWS),
    cells: z.array(TableCellSchema),
    headerRow: z.boolean(),
  })
  /*
   * The one invariant that cannot be expressed field by field: the cell count
   * IS the grid's shape. A table whose cells do not fill it exactly would
   * render holes or drop content, and a document that could hold one would
   * make every reader of it defensive.
   */
  .refine((data) => data.cells.length === data.columns.length * data.rows.length, {
    message: 'A table holds exactly one cell per column per row',
  })

/** Where a cell sits in the flat list. */
export function cellIndex(data: TableData, column: number, row: number): number {
  return row * data.columns.length + column
}

/** An empty grid of the given shape, for creation and for adding rows. */
export function emptyCells(count: number): TableCell[] {
  return Array.from({ length: count }, () => ({ text: [{ text: '' }] }))
}
