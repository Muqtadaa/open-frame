import { type ZodType, z } from 'zod'

import { isColorValue, type ColorValue } from '../../domain/object.js'
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

/**
 * One cell's contents, and what it is dressed in.
 *
 * The three colours are OPTIONAL and absent means "the table's own" — the same
 * sparse convention `ObjectStyle` uses, for the same reason: a cell that
 * recorded the table's current colour would stop following it the moment the
 * table changed, and a grid of 400 cells each carrying three tokens is a lot
 * of document to say nothing.
 *
 * Deliberately NOT an `ObjectStyle`. A cell is not an object: it has no font
 * of its own (a table's type is the table's), no opacity, no alignment, and
 * giving it a style record would invite every one of those to be honoured
 * here — a capability declared and ignored, which is what rule 21 is about.
 * Three colours are what a cell can wear, and the type says so.
 */
export interface TableCell {
  readonly text: RichText
  /** What the cell stands on. */
  readonly fill?: ColorValue
  /** The ink of this cell's text, overriding the table's. */
  readonly textColor?: ColorValue
  /** The colour of this cell's rules. */
  readonly border?: ColorValue
}

/** The colours a cell may carry, as a patch. Absent keys are left alone. */
export interface CellStyle {
  readonly fill?: ColorValue
  readonly textColor?: ColorValue
  readonly border?: ColorValue
}

/**
 * The colour keys, at runtime.
 *
 * A `Record<keyof CellStyle, true>` for the reason `EVERY_STYLE_PROP` is one:
 * it does not compile until every key is present, so a fourth colour added to
 * `CellStyle` cannot be forgotten by the code that clears or copies them.
 */
export const CELL_STYLE_KEYS: Readonly<Record<keyof CellStyle, true>> = {
  fill: true,
  textColor: true,
  border: true,
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

/**
 * A colour, validated. The SAME question `sanitizeStyle` asks of an object's
 * style, asked here because a cell's colours are type data and go through the
 * type's own schema rather than that gate.
 *
 * A bad one is refused rather than dropped, because unlike a whole board's
 * style this is inside `data`: `validate` is all-or-nothing per object, and a
 * table whose colours were silently edited on the way in would be a document
 * that changed itself.
 */
const ColorValueSchema = z.custom<ColorValue>(isColorValue, {
  message: 'A colour is a palette token or six hex digits',
})

/*
 * Cast for the same reason `ImageDataSchema` is: under
 * `exactOptionalPropertyTypes`, `fill?: ColorValue` cannot hold `undefined`,
 * while Zod's `.optional()` produces exactly `ColorValue | undefined`. The
 * two describe the same runtime values and disagree about a type that never
 * exists — a parsed cell either has the key or does not.
 */
const TableCellSchema = z.object({
  text: RichTextSchema,
  fill: ColorValueSchema.optional(),
  textColor: ColorValueSchema.optional(),
  border: ColorValueSchema.optional(),
}) as unknown as ZodType<TableCell>

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

/**
 * A table with a column or row added or removed, cells and weights together.
 *
 * ONE function for all four operations, because they are one operation with a
 * sign and an axis — and because the cell list and the weights must change in
 * the same breath. Two functions that each moved half of it is how a table
 * ends up disagreeing with its own shape.
 *
 * Returns the table unchanged when the change is not allowed: past the
 * maximum, or below the last column or row. A table with no columns is not a
 * smaller table, it is not a table.
 */
export function resizeGrid(
  data: TableData,
  axis: 'column' | 'row',
  delta: 1 | -1,
): TableData {
  const columns = [...data.columns]
  const rows = [...data.rows]
  const width = columns.length
  const height = rows.length

  if (axis === 'column') {
    if (delta === 1 && width >= MAX_COLUMNS) return data
    if (delta === -1 && width <= 1) return data
  } else {
    if (delta === 1 && height >= MAX_ROWS) return data
    if (delta === -1 && height <= 1) return data
  }

  /*
   * A new column takes the AVERAGE of the existing weights rather than 1.
   * On a table whose columns have been resized, a weight of 1 beside weights
   * of 40 is a column too thin to see — technically added, practically not.
   */
  const average = (weights: readonly number[]): number =>
    weights.reduce((sum, weight) => sum + weight, 0) / weights.length

  if (axis === 'column') {
    if (delta === 1) columns.push(average(columns))
    else columns.pop()
  } else if (delta === 1) {
    rows.push(average(rows))
  } else {
    rows.pop()
  }

  /*
   * The cells are rebuilt by READING the old grid at each new position, which
   * is what keeps existing content where it was. Slicing the flat list would
   * be right for a row — rows are contiguous — and wrong for a column, where
   * removing one means dropping every width-th entry. Doing both the same way
   * removes the chance of getting the second one wrong.
   */
  const cells: TableCell[] = []
  for (let row = 0; row < rows.length; row++) {
    for (let column = 0; column < columns.length; column++) {
      const old = row < height && column < width ? data.cells[row * width + column] : undefined
      cells.push(old ?? { text: [{ text: '' }] })
    }
  }

  return { ...data, columns, rows, cells }
}


/**
 * Where a table's internal divisions fall, as fractions of its extent.
 *
 * The boundaries BETWEEN tracks, so a three-column table has two — the outer
 * edges are the object's own and are moved by resizing it, not by dragging a
 * divider.
 */
export function dividerPositions(weights: readonly number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (total <= 0) return []

  const found: number[] = []
  let running = 0
  for (const weight of weights.slice(0, -1)) {
    running += weight
    found.push(running / total)
  }
  return found
}

/**
 * The smallest a track may be, in world units.
 *
 * ABSOLUTE rather than a share of the table, because a track is now resized
 * without reference to its neighbours — there is no pair to take a fraction
 * of, and a share of the whole would let a column in a wide table be dragged
 * to something you still could not type into.
 */
export const MIN_TRACK = 20

/**
 * The weights and total size after dragging the boundary at `index` to `to`.
 *
 * ONLY the track before the boundary changes. Everything past it keeps the
 * size it had and simply shifts along, and the table GROWS or SHRINKS to
 * accommodate — which is what a spreadsheet does, and what somebody widening
 * one column is asking for. The previous behaviour preserved the pair's sum,
 * so widening a column narrowed its neighbour: you could not make a column
 * bigger without making another smaller, and the table could never change
 * size at all.
 *
 * `to` is a fraction of the object's CURRENT extent, which is the unit the
 * gesture speaks. `total` is that extent in world units, which is what makes
 * the answer absolute.
 *
 * Weights come back as sizes. They are relative by definition, so any scale
 * describes the same table — and using the sizes themselves is what keeps
 * every other track exactly where it was.
 */
export function resizeTrackAt(
  weights: readonly number[],
  index: number,
  to: number,
  total: number,
): { readonly weights: readonly number[]; readonly total: number } | null {
  const sum = weights.reduce((weight, next) => weight + next, 0)
  if (weights[index] === undefined || sum <= 0 || total <= 0) return null

  // Every track at its present size, so the ones we do not touch are untouched.
  const sizes = weights.map((weight) => (weight / sum) * total)
  const before = sizes.slice(0, index).reduce((running, size) => running + size, 0)

  const wanted = to * total - before
  const next = [...sizes]
  next[index] = Math.max(MIN_TRACK, wanted)

  return { weights: next, total: next.reduce((running, size) => running + size, 0) }
}

/**
 * The weights and total size after setting one track to an exact size.
 *
 * The same operation the drag performs, reached from a measurement rather than
 * from a pointer — double-clicking a boundary asks for the size the content
 * needs, and that arrives already in world units.
 */
export function setTrackSize(
  weights: readonly number[],
  index: number,
  size: number,
  total: number,
): { readonly weights: readonly number[]; readonly total: number } | null {
  const sum = weights.reduce((weight, next) => weight + next, 0)
  if (weights[index] === undefined || sum <= 0 || total <= 0) return null

  const sizes = weights.map((weight) => (weight / sum) * total)
  const next = [...sizes]
  next[index] = Math.max(MIN_TRACK, size)
  return { weights: next, total: next.reduce((running, each) => running + each, 0) }
}

/**
 * The cells a rectangular selection covers, as flat indices in reading order.
 *
 * Takes two corners in either order and normalises them, because a selection
 * is made by dragging and half of all drags go up or left. Returning indices
 * rather than a rect is what lets the caller stay ignorant of the grid's shape
 * — and what makes "style these cells" one operation over a list.
 */
export function cellRange(
  data: TableData,
  anchor: number,
  focus: number,
): readonly number[] {
  const width = data.columns.length
  const count = width * data.rows.length
  if (width === 0 || anchor < 0 || focus < 0 || anchor >= count || focus >= count) return []

  const [left, right] = [anchor % width, focus % width].sort((a, b) => a - b) as [number, number]
  const [top, bottom] = [Math.floor(anchor / width), Math.floor(focus / width)].sort(
    (a, b) => a - b,
  ) as [number, number]

  const indices: number[] = []
  for (let row = top; row <= bottom; row += 1) {
    for (let column = left; column <= right; column += 1) indices.push(row * width + column)
  }
  return indices
}

/**
 * The same cells with a colour patch applied, as new data.
 *
 * Pure, and it returns the WHOLE table: the caller dispatches one
 * `UpdateObjectData`, so styling nine cells is one command and one undo entry
 * exactly like styling one.
 *
 * A key set to `null` CLEARS it, which is not the same as leaving it out. "Put
 * these cells back to the table's own colour" is a thing people want and there
 * is no token for it — `undefined` already means "not mentioned", so the two
 * need different spellings or one of them is unreachable.
 */
export function styleCells(
  data: TableData,
  indices: readonly number[],
  patch: Readonly<Partial<Record<keyof CellStyle, ColorValue | null>>>,
): TableData {
  const touched = new Set(indices)
  if (touched.size === 0) return data

  return {
    ...data,
    cells: data.cells.map((cell, index) => {
      if (!touched.has(index)) return cell
      const next: { -readonly [K in keyof TableCell]: TableCell[K] } = { ...cell }
      for (const key of Object.keys(CELL_STYLE_KEYS) as (keyof CellStyle)[]) {
        const value = patch[key]
        if (value === undefined) continue
        if (value === null) delete next[key]
        else next[key] = value
      }
      return next
    }),
  }
}

/**
 * Where a range of cells sits inside the table, as fractions of its extent.
 *
 * Fractions rather than pixels, because the caller placing something beside
 * these cells knows where the table is on screen and this does not — the same
 * split `dividerPositions` makes, and the same unit a comment pin uses.
 *
 * `null` for an empty range: there is no rectangle around no cells, and
 * returning the whole table instead would silently anchor a control to
 * something the user did not select.
 */
export function cellRegion(
  data: TableData,
  indices: readonly number[],
): { x: number; y: number; width: number; height: number } | null {
  const width = data.columns.length
  if (width === 0 || indices.length === 0) return null

  const columns = indices.map((index) => index % width)
  const rows = indices.map((index) => Math.floor(index / width))
  const left = Math.min(...columns)
  const right = Math.max(...columns)
  const top = Math.min(...rows)
  const bottom = Math.max(...rows)

  const across = data.columns.reduce((sum, weight) => sum + weight, 0)
  const down = data.rows.reduce((sum, weight) => sum + weight, 0)
  if (across === 0 || down === 0) return null

  const before = (weights: readonly number[], upTo: number): number =>
    weights.slice(0, upTo).reduce((sum, weight) => sum + weight, 0)
  const span = (weights: readonly number[], from: number, to: number): number =>
    weights.slice(from, to + 1).reduce((sum, weight) => sum + weight, 0)

  return {
    x: before(data.columns, left) / across,
    y: before(data.rows, top) / down,
    width: span(data.columns, left, right) / across,
    height: span(data.rows, top, bottom) / down,
  }
}
