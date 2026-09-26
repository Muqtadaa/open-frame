import { type ZodType, z } from 'zod'

import {
  ALIGN_TOKENS,
  DASH_TOKENS,
  STROKE_TOKENS,
  VALIGN_TOKENS,
  isColorValue,
  type AlignToken,
  type ColorValue,
  type DashToken,
  type StrokeToken,
  type VAlignToken,
} from '../../domain/object.js'
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
 * The two colours are OPTIONAL and absent means "the table's own" — the same
 * sparse convention `ObjectStyle` uses, for the same reason: a cell that
 * recorded the table's current colour would stop following it the moment the
 * table changed, and a grid of 400 cells each carrying three tokens is a lot
 * of document to say nothing.
 *
 * Deliberately NOT an `ObjectStyle`. A cell is not an object: it has no font
 * of its own (a table's type is the table's), no opacity, and giving it a
 * style record would invite every one of those to be honoured here — a
 * capability declared and ignored, which is what rule 21 is about. Two
 * colours and an alignment are what a cell can wear, and the type says so.
 *
 * Alignment is the cell's because a table is read by COLUMN: a column of
 * figures sits right under headings that sit left, and a table that could
 * only be aligned as a whole could not say that. Absent, like the colours,
 * means the table's own.
 *
 * A cell has no border of its own (ADR 0015). The line between two cells
 * belongs to BOTH of them, so a colour stored on one cell had to lose to, or
 * beat, the one stored on its neighbour — and a cell that could colour only
 * its right and bottom sides looked, to anyone setting it, like the table
 * ignoring half of what they asked. Lines live on the grid instead.
 */
export interface TableCell {
  readonly text: RichText
  /** What the cell stands on. */
  readonly fill?: ColorValue
  /** The ink of this cell's text, overriding the table's. */
  readonly textColor?: ColorValue
  /** Where the text sits across the cell, overriding the table's. */
  readonly align?: AlignToken
  /** Where the text sits down the cell, overriding the table's. */
  readonly verticalAlign?: VAlignToken
}

/** What a cell may wear, as a patch. Absent keys are left alone. */
export interface CellStyle {
  readonly fill?: ColorValue
  readonly textColor?: ColorValue
  readonly align?: AlignToken
  readonly verticalAlign?: VAlignToken
}

/** A patch to a cell's dress: a value sets, `null` clears, absent leaves alone. */
export type CellStylePatch = {
  readonly [K in keyof CellStyle]?: NonNullable<CellStyle[K]> | null
}

/**
 * The colour keys, at runtime.
 *
 * A `Record<keyof CellStyle, true>` for the reason `EVERY_STYLE_PROP` is one:
 * it does not compile until every key is present, so a third colour added to
 * `CellStyle` cannot be forgotten by the code that clears or copies them.
 */
export const CELL_STYLE_KEYS: Readonly<Record<keyof CellStyle, true>> = {
  fill: true,
  textColor: true,
  align: true,
  verticalAlign: true,
}

/**
 * How ONE stretch of grid line is drawn. Every key optional: absent is the
 * table's own — its `strokeColor`, its `stroke` — so a table recoloured as a
 * whole recolours every line nobody chose separately.
 *
 * The same tokens an object's own line uses, so a table's "thick" is a
 * shape's "thick" and a weight of `none` is how a line is taken away.
 */
export interface TableLine {
  readonly color?: ColorValue
  readonly weight?: StrokeToken
  readonly dash?: DashToken
}

/**
 * One stretch of line, where it sits on the grid.
 *
 * A HORIZONTAL line at `row` runs along the TOP of that row, under column
 * `col` — so `row` goes up to the row count, which is the bottom edge. A
 * VERTICAL one at `col` runs down the LEFT of that column, beside row `row`,
 * and `col` goes up to the column count. A cell's four sides are therefore
 * four addresses, and the cell next to it names the same line from the other
 * side: there is one line, not two opinions about it.
 */
export interface LineAt {
  readonly row: number
  readonly col: number
  readonly line: TableLine
}

/** Every line anybody set, sparse: a table nobody has ruled holds none. */
export interface TableLines {
  readonly h: readonly LineAt[]
  readonly v: readonly LineAt[]
}

/**
 * A block of cells drawn as one, anchored at its top-left.
 *
 * The cells it covers KEEP their contents and are simply not drawn, so undoing
 * a merge by unmerging brings back what was there rather than asking whether
 * to throw it away.
 */
export interface Merge {
  readonly row: number
  readonly col: number
  readonly rows: number
  readonly cols: number
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
  /** The grid's lines that differ from the table's own. Absent is none. */
  readonly lines?: TableLines
  /** Blocks of cells drawn as one. Absent is none. */
  readonly merges?: readonly Merge[]
}

/** v2: lines on the grid rather than borders on cells, and merges (ADR 0015). */
export const TABLE_VERSION = 2

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
/*
 * `.strict()` so a cell still carrying a v1 `border` is REFUSED rather than
 * quietly losing it: the migration is what moves it onto the grid, and a
 * payload that skipped the migration should say so (rule 23's `z.object({})`).
 */
const TableCellSchema = z
  .object({
    text: RichTextSchema,
    fill: ColorValueSchema.optional(),
    textColor: ColorValueSchema.optional(),
    align: z.enum(ALIGN_TOKENS).optional(),
    verticalAlign: z.enum(VALIGN_TOKENS).optional(),
  })
  .strict() as unknown as ZodType<TableCell>

const TableLineSchema = z
  .object({
    color: ColorValueSchema.optional(),
    weight: z.enum(STROKE_TOKENS).optional(),
    dash: z.enum(DASH_TOKENS).optional(),
  })
  .strict()

const Index = z.number().int().min(0)

const LineAtSchema = z.object({ row: Index, col: Index, line: TableLineSchema }).strict()

const MergeSchema = z
  .object({ row: Index, col: Index, rows: Index.min(1), cols: Index.min(1) })
  .strict()

export const TableDataSchema: ZodType<TableData> = z
  .object({
    columns: z.array(WeightSchema).min(1).max(MAX_COLUMNS),
    rows: z.array(WeightSchema).min(1).max(MAX_ROWS),
    cells: z.array(TableCellSchema),
    headerRow: z.boolean(),
    lines: z.object({ h: z.array(LineAtSchema), v: z.array(LineAtSchema) }).strict().optional(),
    merges: z.array(MergeSchema).optional(),
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
  /*
   * Every line on the grid, and each one ONCE. Two entries for one stretch
   * of line would be the "whose border wins" question this model exists to
   * make unaskable, back in through the side door.
   */
  .refine((data) => linesFit(data), {
    message: 'Each line sits on the grid, once',
  })
  /*
   * Merges inside the grid and apart from one another. Two that overlap would
   * each claim the cells they share, and the grid would have to draw one
   * cell in two places.
   */
  .refine((data) => mergesFit(data), {
    message: 'Merges lie inside the grid and never overlap',
  }) as unknown as ZodType<TableData>

function linesFit(data: {
  columns: readonly unknown[]
  rows: readonly unknown[]
  lines?: { h: readonly { row: number; col: number }[]; v: readonly { row: number; col: number }[] } | undefined
}): boolean {
  if (data.lines === undefined) return true
  const width = data.columns.length
  const height = data.rows.length
  const once = (
    entries: readonly { row: number; col: number }[],
    maxRow: number,
    maxCol: number,
  ): boolean => {
    const seen = new Set<string>()
    for (const { row, col } of entries) {
      if (row > maxRow || col > maxCol) return false
      const key = `${String(row)}:${String(col)}`
      if (seen.has(key)) return false
      seen.add(key)
    }
    return true
  }
  return once(data.lines.h, height, width - 1) && once(data.lines.v, height - 1, width)
}

function mergesFit(data: {
  columns: readonly unknown[]
  rows: readonly unknown[]
  merges?: readonly Merge[] | undefined
}): boolean {
  if (data.merges === undefined) return true
  const taken = new Set<number>()
  const width = data.columns.length
  for (const merge of data.merges) {
    if (merge.rows * merge.cols < 2) return false
    if (merge.row + merge.rows > data.rows.length || merge.col + merge.cols > width) return false
    for (let row = merge.row; row < merge.row + merge.rows; row++) {
      for (let col = merge.col; col < merge.col + merge.cols; col++) {
        const index = row * width + col
        if (taken.has(index)) return false
        taken.add(index)
      }
    }
  }
  return true
}

/** Where a cell sits in the flat list. */
export function cellIndex(data: TableData, column: number, row: number): number {
  return row * data.columns.length + column
}

/** An empty grid of the given shape, for creation and for adding rows. */
export function emptyCells(count: number): TableCell[] {
  return Array.from({ length: count }, () => ({ text: [{ text: '' }] }))
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
  patch: CellStylePatch,
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
        else (next as Record<keyof CellStyle, unknown>)[key] = value
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
