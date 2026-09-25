import {
  MAX_COLUMNS,
  MAX_ROWS,
  type LineAt,
  type Merge,
  type TableCell,
  type TableData,
  type TableLine,
  type TableLines,
} from './schema.js'

/**
 * What a table can have done to it as a spreadsheet: tracks inserted and
 * deleted anywhere, cells merged, lines ruled (ADR 0015).
 *
 * Every operation here is pure and returns the WHOLE table. The editor keeps
 * one draft and dispatches one `UpdateObjectData` when it closes (rules 3 and
 * 4), so inserting three rows, ruling them and typing into them is one undo
 * entry — and the cells, the weights, the lines and the merges have to move in
 * the same breath or the table ends up disagreeing with its own shape.
 */

export type Axis = 'row' | 'column'

/** A block of cells, inclusive at both ends. */
export interface CellRange {
  readonly top: number
  readonly left: number
  readonly bottom: number
  readonly right: number
}

/** Two corners in either order, as a range. Half of all drags go up or left. */
export function rangeBetween(
  a: { readonly row: number; readonly col: number },
  b: { readonly row: number; readonly col: number },
): CellRange {
  return {
    top: Math.min(a.row, b.row),
    left: Math.min(a.col, b.col),
    bottom: Math.max(a.row, b.row),
    right: Math.max(a.col, b.col),
  }
}

/** The whole table, as a range. */
export function wholeTable(data: TableData): CellRange {
  return { top: 0, left: 0, bottom: data.rows.length - 1, right: data.columns.length - 1 }
}

/** The flat indices a range covers, in reading order. */
export function indicesOf(data: TableData, range: CellRange): number[] {
  const width = data.columns.length
  const found: number[] = []
  for (let row = range.top; row <= range.bottom; row++) {
    for (let col = range.left; col <= range.right; col++) found.push(row * width + col)
  }
  return found
}

/** The merge a cell is part of, anchor or covered, if any. */
export function mergeAt(data: TableData, row: number, col: number): Merge | undefined {
  return data.merges?.find(
    (merge) =>
      row >= merge.row &&
      row < merge.row + merge.rows &&
      col >= merge.col &&
      col < merge.col + merge.cols,
  )
}

/** Whether a cell is hidden under a merge anchored somewhere else. */
export function isCovered(data: TableData, row: number, col: number): boolean {
  const merge = mergeAt(data, row, col)
  return merge !== undefined && (merge.row !== row || merge.col !== col)
}

const overlaps = (range: CellRange, merge: Merge): boolean =>
  merge.row <= range.bottom &&
  merge.row + merge.rows - 1 >= range.top &&
  merge.col <= range.right &&
  merge.col + merge.cols - 1 >= range.left

/**
 * A range grown until it holds every merge it touches whole.
 *
 * A selection that cut a merge in half would colour, clear or rule part of
 * something drawn as one cell — which is to say, something the person could
 * not see they had split. Repeated until nothing grows, because taking in one
 * merge can reach another.
 */
export function expandToMerges(data: TableData, range: CellRange): CellRange {
  let current = range
  for (;;) {
    let next = current
    for (const merge of data.merges ?? []) {
      if (!overlaps(next, merge)) continue
      next = {
        top: Math.min(next.top, merge.row),
        left: Math.min(next.left, merge.col),
        bottom: Math.max(next.bottom, merge.row + merge.rows - 1),
        right: Math.max(next.right, merge.col + merge.cols - 1),
      }
    }
    if (
      next.top === current.top &&
      next.left === current.left &&
      next.bottom === current.bottom &&
      next.right === current.right
    ) {
      return next
    }
    current = next
  }
}

/** Only the defined keys, so an absent list and an empty one read the same. */
function withOptional(data: TableData, lines: TableLines, merges: readonly Merge[]): TableData {
  const rest: { -readonly [K in keyof TableData]: TableData[K] } = { ...data }
  delete rest.lines
  delete rest.merges
  return {
    ...rest,
    ...(lines.h.length > 0 || lines.v.length > 0 ? { lines } : {}),
    ...(merges.length > 0 ? { merges } : {}),
  }
}

const NO_LINES: TableLines = { h: [], v: [] }

/** The track a new one copies: the one before it, or after it at the start. */
function sourceOf(data: TableData, axis: Axis, at: number): { index: number; before: boolean } {
  /*
   * Inserting just under a header row copies the row BELOW. What you are
   * adding is another row of the body, and a copy of the header's bold ground
   * would be a second header nobody asked for.
   */
  if (axis === 'row' && data.headerRow && at === 1 && data.rows.length > 1) {
    return { index: 1, before: false }
  }
  return at > 0 ? { index: at - 1, before: true } : { index: 0, before: false }
}

/**
 * `count` new rows or columns at position `at`, dressed like their neighbour.
 *
 * A new track copies the one BEFORE it (the one after, at the very start):
 * its weight, each cell's fill and ink, and its lines — but not its words. A
 * table somebody has coloured by row keeps being coloured by row as it grows,
 * which is what "inherit styles from the adjacent cells" asks for and what a
 * spreadsheet does.
 *
 * The lines take some care, because a line sits BETWEEN tracks. The table's
 * outer edges stay its outer edges: adding a row to the bottom of a table with
 * a heavy border moves the heavy border down rather than leaving it inside the
 * table. The lines inside the new block copy the source track's inner line.
 *
 * Refused (the table comes back unchanged) past the maximum.
 */
export function insertTracks(data: TableData, axis: Axis, at: number, count = 1): TableData {
  const length = axis === 'row' ? data.rows.length : data.columns.length
  const max = axis === 'row' ? MAX_ROWS : MAX_COLUMNS
  if (count < 1 || at < 0 || at > length || length + count > max) return data

  const source = sourceOf(data, axis, at)
  // Where each new track reads from in the old table.
  const from = (index: number): number =>
    index < at ? index : index >= at + count ? index - count : source.index
  const isNew = (index: number): boolean => index >= at && index < at + count

  const weights = axis === 'row' ? data.rows : data.columns
  const nextWeights = Array.from(
    { length: length + count },
    (_, index) => weights[from(index)] ?? 1,
  )

  const width = data.columns.length
  const height = data.rows.length
  const nextWidth = axis === 'column' ? width + count : width
  const nextHeight = axis === 'row' ? height + count : height

  const cells: TableCell[] = []
  for (let row = 0; row < nextHeight; row++) {
    for (let col = 0; col < nextWidth; col++) {
      const oldRow = axis === 'row' ? from(row) : row
      const oldCol = axis === 'column' ? from(col) : col
      const old = data.cells[oldRow * width + oldCol] ?? { text: [{ text: '' }] }
      const fresh = axis === 'row' ? isNew(row) : isNew(col)
      // The dress, not the words.
      cells.push(fresh ? { ...old, text: [{ text: '' }] } : old)
    }
  }

  /*
   * Which old line each line index along the axis becomes. Lines BEFORE the
   * block and AFTER it keep theirs; the edge of the block away from the source
   * keeps the line that was there; the rest copy the source's inner line.
   */
  const inner = innerLineOf(source.index, source.before, length)
  const lineFrom = (index: number): number | null => {
    if (index < at) return index
    if (index > at + count) return index - count
    if (source.before) return index === at + count ? at : inner
    return index === at ? at : inner
  }

  const lines = data.lines ?? NO_LINES
  // Along the axis: the lines that cross it. Beside it: the segments that run along each track.
  const across = axis === 'row' ? lines.h : lines.v
  const along = axis === 'row' ? lines.v : lines.h
  const pos = (entry: LineAt): number => (axis === 'row' ? entry.row : entry.col)
  // A segment running beside a track is named by that track, on the same axis.
  const seg = pos
  const place = (entry: LineAt, index: number): LineAt =>
    axis === 'row' ? { ...entry, row: index } : { ...entry, col: index }

  const nextAcross: LineAt[] = []
  for (let index = 0; index <= length + count; index++) {
    const old = lineFrom(index)
    if (old === null) continue
    for (const entry of across) if (pos(entry) === old) nextAcross.push(place(entry, index))
  }
  const nextAlong: LineAt[] = []
  for (let index = 0; index < length + count; index++) {
    const old = from(index)
    for (const entry of along) if (seg(entry) === old) nextAlong.push(placeSeg(entry, index, axis))
  }

  /*
   * A merge the insertion lands INSIDE grows to take the new tracks; one
   * wholly after it moves along. Inserting exactly at a merge's edge is
   * outside it — the new row goes beside the merged block, not into it.
   */
  const merges = (data.merges ?? []).map((merge) => {
    const start = axis === 'row' ? merge.row : merge.col
    const span = axis === 'row' ? merge.rows : merge.cols
    if (at <= start)
      return axis === 'row' ? { ...merge, row: start + count } : { ...merge, col: start + count }
    if (at < start + span)
      return axis === 'row' ? { ...merge, rows: span + count } : { ...merge, cols: span + count }
    return merge
  })

  const next: TableData = {
    ...data,
    columns: axis === 'column' ? nextWeights : data.columns,
    rows: axis === 'row' ? nextWeights : data.rows,
    cells,
  }
  const nextLines =
    axis === 'row' ? { h: nextAcross, v: nextAlong } : { h: nextAlong, v: nextAcross }
  return withOptional(next, nextLines, merges)
}

/** The segment's position along the track it runs beside, moved. */
function placeSeg(entry: LineAt, index: number, axis: Axis): LineAt {
  return axis === 'row' ? { ...entry, row: index } : { ...entry, col: index }
}

/**
 * The line INSIDE the table next to a track, preferring the side away from
 * where the new tracks go — `null` for a table one track deep, which has no
 * inside line to copy and so leaves the new ones at the table's own.
 */
function innerLineOf(track: number, before: boolean, length: number): number | null {
  const top = track > 0 ? track : null
  const bottom = track + 1 < length ? track + 1 : null
  return before ? (top ?? bottom) : (bottom ?? top)
}

/**
 * `count` rows or columns removed, starting at `from`.
 *
 * Refused when it would take the last one: a table with no columns is not a
 * smaller table, it is not a table.
 *
 * Where the removed block's two edges collapse into one line, the OUTER one
 * survives when there is one, so deleting the last row of a boxed table keeps
 * the box. Otherwise the line above the gap is kept.
 */
export function deleteTracks(data: TableData, axis: Axis, from: number, count = 1): TableData {
  const length = axis === 'row' ? data.rows.length : data.columns.length
  if (count < 1 || from < 0 || from + count > length || count >= length) return data

  const gone = (index: number): boolean => index >= from && index < from + count
  const weights = axis === 'row' ? data.rows : data.columns
  const nextWeights = weights.filter((_, index) => !gone(index))

  const width = data.columns.length
  const cells = data.cells.filter((_, index) => {
    const row = Math.floor(index / width)
    const col = index % width
    return !gone(axis === 'row' ? row : col)
  })

  const keep = from + count === length ? from + count : from
  const lineTo = (index: number): number | null => {
    if (index < from) return index
    if (index > from + count) return index - count
    return index === keep ? from : null
  }

  const lines = data.lines ?? NO_LINES
  const across = axis === 'row' ? lines.h : lines.v
  const along = axis === 'row' ? lines.v : lines.h
  const pos = (entry: LineAt): number => (axis === 'row' ? entry.row : entry.col)
  // A segment running beside a track is named by that track, on the same axis.
  const seg = pos

  const nextAcross: LineAt[] = []
  for (const entry of across) {
    const to = lineTo(pos(entry))
    if (to !== null) nextAcross.push(axis === 'row' ? { ...entry, row: to } : { ...entry, col: to })
  }
  const nextAlong: LineAt[] = []
  for (const entry of along) {
    const at = seg(entry)
    if (gone(at)) continue
    nextAlong.push(placeSeg(entry, at < from ? at : at - count, axis))
  }

  const merges: Merge[] = []
  for (const merge of data.merges ?? []) {
    const start = axis === 'row' ? merge.row : merge.col
    const span = axis === 'row' ? merge.rows : merge.cols
    const end = start + span
    const removed = Math.max(0, Math.min(end, from + count) - Math.max(start, from))
    const nextStart = start < from ? start : Math.max(from, start - count)
    const nextSpan = span - removed
    if (nextSpan < 1) continue
    const moved =
      axis === 'row'
        ? { ...merge, row: nextStart, rows: nextSpan }
        : { ...merge, col: nextStart, cols: nextSpan }
    // A merge cut down to one cell is just a cell.
    if (moved.rows * moved.cols > 1) merges.push(moved)
  }

  const next: TableData = {
    ...data,
    columns: axis === 'column' ? nextWeights : data.columns,
    rows: axis === 'row' ? nextWeights : data.rows,
    cells,
  }
  const nextLines =
    axis === 'row' ? { h: nextAcross, v: nextAlong } : { h: nextAlong, v: nextAcross }
  return withOptional(next, nextLines, merges)
}

/**
 * A table with a column or row added at the end or removed from it.
 *
 * What the rail's size picker, the MCP tools and the tests of the original
 * grid speak; the spreadsheet operations underneath are the same ones the
 * editor uses anywhere in the table.
 */
export function resizeGrid(data: TableData, axis: Axis, delta: 1 | -1): TableData {
  const length = axis === 'row' ? data.rows.length : data.columns.length
  return delta === 1 ? insertTracks(data, axis, length, 1) : deleteTracks(data, axis, length - 1, 1)
}

/**
 * A range drawn as one cell, anchored at its top-left.
 *
 * Merges it touches are taken in whole and replaced by the one new merge. The
 * cells it covers keep their contents — unmerging brings them back — and a
 * range of one cell merges nothing.
 */
export function mergeRange(data: TableData, range: CellRange): TableData {
  const whole = expandToMerges(data, range)
  const rows = whole.bottom - whole.top + 1
  const cols = whole.right - whole.left + 1
  const kept = (data.merges ?? []).filter((merge) => !overlaps(whole, merge))
  const merges = rows * cols > 1 ? [...kept, { row: whole.top, col: whole.left, rows, cols }] : kept
  return withOptional(data, data.lines ?? NO_LINES, merges)
}

/** Every merge the range touches, taken apart. */
export function unmergeRange(data: TableData, range: CellRange): TableData {
  const merges = (data.merges ?? []).filter((merge) => !overlaps(range, merge))
  return withOptional(data, data.lines ?? NO_LINES, merges)
}

/** Whether any merge touches the range. */
export function hasMerge(data: TableData, range: CellRange): boolean {
  return (data.merges ?? []).some((merge) => overlaps(range, merge))
}

/**
 * Which edges of a range a borders choice reaches — the presets every
 * spreadsheet's borders menu offers.
 *
 * `reset` hands the edges back to the table's own line; `none` takes them away
 * outright. They are different: a line reset on a table later ruled thick
 * turns thick with it, and one taken away stays away.
 */
export const LINE_PRESETS = [
  'all',
  'outer',
  'inner',
  'horizontal',
  'vertical',
  'top',
  'bottom',
  'left',
  'right',
  'none',
  'reset',
] as const

export type LinePreset = (typeof LINE_PRESETS)[number]

/**
 * The given edges of a range drawn with `line`.
 *
 * The range is taken to whole merges first, so "outer" goes round what is on
 * screen rather than through the middle of a merged cell. Keys of `line` the
 * caller leaves out are the table's own, as everywhere.
 */
export function setLines(
  data: TableData,
  range: CellRange,
  preset: LinePreset,
  line: TableLine = {},
): TableData {
  const whole = expandToMerges(data, range)
  const drawn: TableLine | null =
    preset === 'reset' ? null : preset === 'none' ? { weight: 'none' } : line

  const want = (kind: 'outerStart' | 'outerEnd' | 'inner', axis: 'h' | 'v'): boolean => {
    switch (preset) {
      case 'all':
      case 'none':
      case 'reset':
        return true
      case 'outer':
        return kind !== 'inner'
      case 'inner':
        return kind === 'inner'
      case 'horizontal':
        return kind === 'inner' && axis === 'h'
      case 'vertical':
        return kind === 'inner' && axis === 'v'
      case 'top':
        return kind === 'outerStart' && axis === 'h'
      case 'bottom':
        return kind === 'outerEnd' && axis === 'h'
      case 'left':
        return kind === 'outerStart' && axis === 'v'
      case 'right':
        return kind === 'outerEnd' && axis === 'v'
    }
  }

  const lines = data.lines ?? NO_LINES
  const touched = { h: new Set<string>(), v: new Set<string>() }
  const key = (row: number, col: number): string => `${String(row)}:${String(col)}`

  for (let row = whole.top; row <= whole.bottom + 1; row++) {
    const kind = row === whole.top ? 'outerStart' : row === whole.bottom + 1 ? 'outerEnd' : 'inner'
    if (!want(kind, 'h')) continue
    for (let col = whole.left; col <= whole.right; col++) touched.h.add(key(row, col))
  }
  for (let col = whole.left; col <= whole.right + 1; col++) {
    const kind = col === whole.left ? 'outerStart' : col === whole.right + 1 ? 'outerEnd' : 'inner'
    if (!want(kind, 'v')) continue
    for (let row = whole.top; row <= whole.bottom; row++) touched.v.add(key(row, col))
  }

  const rewrite = (entries: readonly LineAt[], set: Set<string>): LineAt[] => {
    const kept = entries.filter((entry) => !set.has(key(entry.row, entry.col)))
    if (drawn === null) return kept
    const added = [...set].map((at) => {
      const [row, col] = at.split(':').map(Number) as [number, number]
      return { row, col, line: drawn }
    })
    return [...kept, ...added]
  }

  return withOptional(
    data,
    { h: rewrite(lines.h, touched.h), v: rewrite(lines.v, touched.v) },
    data.merges ?? [],
  )
}

/**
 * The line somebody set at one address, or `undefined` for the table's own.
 *
 * For drawing a whole grid use `lineLookup`, which indexes once: asking this
 * per line is a scan per line, which on a 26 by 200 table is rule 10.
 */
export function lineLookup(
  data: TableData,
): (orientation: 'h' | 'v', row: number, col: number) => TableLine | undefined {
  const index = { h: new Map<string, TableLine>(), v: new Map<string, TableLine>() }
  for (const entry of data.lines?.h ?? [])
    index.h.set(`${String(entry.row)}:${String(entry.col)}`, entry.line)
  for (const entry of data.lines?.v ?? [])
    index.v.set(`${String(entry.row)}:${String(entry.col)}`, entry.line)
  return (orientation, row, col) => index[orientation].get(`${String(row)}:${String(col)}`)
}

/** The words gone from a range's cells, the dress left on. */
export function clearCells(data: TableData, range: CellRange): TableData {
  const touched = new Set(indicesOf(data, range))
  return {
    ...data,
    cells: data.cells.map((cell, index) =>
      touched.has(index) ? { ...cell, text: [{ text: '' }] } : cell,
    ),
  }
}
