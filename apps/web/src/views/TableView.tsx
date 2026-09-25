import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'

import {
  DEFAULT_SIZE,
  LINE_PRESETS,
  MARKS,
  applyMark,
  applySize,
  clearCells,
  listOf,
  markCovers,
  plainTextOf,
  setList,
  deleteTracks,
  expandToMerges,
  hasMerge,
  indicesOf,
  insertTracks,
  lineLookup,
  mergeAt,
  mergeRange,
  rangeBetween,
  setLines,
  styleCells,
  unmergeRange,
  type Axis,
  type CellRange,
  type CellStyle,
  type ColorValue,
  type DashToken,
  type LinePreset,
  type ListKind,
  type Mark,
  type Merge,
  type ObjectStyle,
  type Rect,
  type RichText,
  type StrokeToken,
  type TableCell,
  type TableData,
  type TableLine,
} from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { FormatBar } from './FormatBar.js'
import {
  RichTextField,
  sizeOfRange,
  stepSize,
  type FormatState,
  type RichTextFieldHandle,
} from './RichTextField.js'
import { RichTextView } from './RichTextView.js'
import { cellAt, tracks } from '../scene/table-grid.js'
import {
  STROKE_WIDTHS,
  dashArray,
  fontFamily,
  inkColor,
  inkOf,
  readableInkOn,
  surfaceOf,
  textAlign,
  verticalAlign,
} from '../scene/style-tokens.js'
import { Swatches, groundOf, type SwatchKind } from '../controls/Swatches.js'
import { BorderPresetIcon, DashIcon, StrokeIcon } from '../controls/icons.js'

/*
 * ---------------------------------------------------------------------------
 * Drawing a table
 * ---------------------------------------------------------------------------
 */

/** Where each track boundary falls, in the object's own units, ends included. */
function edgesOf(weights: readonly number[], extent: number): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const found = [0]
  let running = 0
  for (const weight of weights) {
    running += weight
    found.push(total > 0 ? (running / total) * extent : 0)
  }
  return found
}

/** The same, as fractions — the unit apparatus is placed in. */
function fractionsOf(weights: readonly number[]): number[] {
  return edgesOf(weights, 1)
}

/**
 * Which cells a merge hides, and which cells anchor one, found ONCE per draw.
 *
 * Asked per cell, `mergeAt` is a scan of every merge per cell — rule 10 on a
 * grid that may hold five thousand of them.
 */
function mergeIndex(data: TableData): {
  readonly anchors: ReadonlyMap<number, Merge>
  readonly covered: ReadonlySet<number>
} {
  const anchors = new Map<number, Merge>()
  const covered = new Set<number>()
  const width = data.columns.length
  for (const merge of data.merges ?? []) {
    anchors.set(merge.row * width + merge.col, merge)
    for (let row = merge.row; row < merge.row + merge.rows; row++) {
      for (let col = merge.col; col < merge.col + merge.cols; col++) {
        if (row !== merge.row || col !== merge.col) covered.add(row * width + col)
      }
    }
  }
  return { anchors, covered }
}

/**
 * One cell's own colours, as a style object, or `undefined` for none.
 *
 * `undefined` rather than an empty object: React treats `style={{}}` as a
 * value that changed on every render, and this runs once per cell per frame on
 * a grid that may hold hundreds.
 */
function cellPaint(cell: TableCell): CSSProperties | undefined {
  if (cell.fill === undefined && cell.textColor === undefined) return undefined
  /*
   * The ink flips on the CELL's own fill, not the table's. A black cell in a
   * plain table is the case: the table says nothing about ink, so without this
   * the cell takes the board's and disappears into itself.
   */
  const ink = cell.textColor === undefined ? readableInkOn(cell.fill) : inkOf(cell.textColor)
  return {
    ...(cell.fill === undefined ? {} : { background: surfaceOf(cell.fill, 'gray') }),
    ...(ink === undefined ? {} : { color: ink }),
  }
}

/**
 * How a line at one address is drawn, or `null` for not at all.
 *
 * Anything the line does not say is the TABLE's: its `strokeColor`, its
 * `stroke`. A table nobody has ruled keeps the look it always had — a firmer
 * edge round a fainter grid — until somebody gives it a line colour, which
 * then means every line, because one colour meaning two was the confusion this
 * model was written to end.
 */
function resolveLine(
  stored: TableLine | undefined,
  style: ObjectStyle,
  outer: boolean,
): { width: number; color: string; dash: DashToken | undefined } | null {
  const weight: StrokeToken = stored?.weight ?? style.stroke ?? 'thin'
  if (weight === 'none') return null
  const color =
    stored?.color !== undefined
      ? inkOf(stored.color)
      : style.strokeColor !== undefined
        ? inkOf(style.strokeColor)
        : outer
          ? 'var(--of-control-border)'
          : 'var(--of-rule)'
  return { width: STROKE_WIDTHS[weight], color, dash: stored?.dash }
}

/**
 * The grid's lines, drawn once over the cells.
 *
 * SVG rather than cell borders, because a line here belongs to the GRID: a
 * border belongs to one element, so two cells either side of a line each had
 * an opinion about it and one of them had to lose. It also lets a line be
 * thick without pushing the text of the cells beside it about, and dashed
 * without the browser's own idea of what a dashed border looks like.
 *
 * Runs of identical segments are joined into one line, so a dashed rule reads
 * as one rule rather than restarting its pattern at every cell.
 */
function GridLines({
  data,
  style,
  width,
  height,
}: {
  readonly data: TableData
  readonly style: ObjectStyle
  readonly width: number
  readonly height: number
}) {
  const xs = edgesOf(data.columns, width)
  const ys = edgesOf(data.rows, height)
  const cols = data.columns.length
  const rows = data.rows.length
  const line = lineLookup(data)

  // The segments INSIDE a merge are not drawn: it is one cell.
  const hidden = { h: new Set<string>(), v: new Set<string>() }
  for (const merge of data.merges ?? []) {
    for (let row = merge.row + 1; row < merge.row + merge.rows; row++) {
      for (let col = merge.col; col < merge.col + merge.cols; col++) {
        hidden.h.add(`${String(row)}:${String(col)}`)
      }
    }
    for (let col = merge.col + 1; col < merge.col + merge.cols; col++) {
      for (let row = merge.row; row < merge.row + merge.rows; row++) {
        hidden.v.add(`${String(row)}:${String(col)}`)
      }
    }
  }

  const drawn: ReactNode[] = []
  const run = (
    orientation: 'h' | 'v',
    at: number,
    count: number,
    outer: boolean,
    place: (from: number, to: number) => { x1: number; y1: number; x2: number; y2: number },
  ): void => {
    let start = 0
    let current: ReturnType<typeof resolveLine> = null
    const flush = (end: number): void => {
      if (current !== null && end > start) {
        drawn.push(
          <line
            key={`${orientation}${String(at)}:${String(start)}`}
            {...place(start, end)}
            stroke={current.color}
            strokeWidth={current.width}
            strokeDasharray={dashArray(current.dash, current.width)}
            strokeLinecap={current.dash === 'dotted' ? 'round' : 'square'}
          />,
        )
      }
    }
    for (let index = 0; index <= count; index++) {
      const key =
        orientation === 'h' ? `${String(at)}:${String(index)}` : `${String(index)}:${String(at)}`
      const next =
        index === count || hidden[orientation].has(key)
          ? null
          : resolveLine(
              orientation === 'h' ? line('h', at, index) : line('v', index, at),
              style,
              outer,
            )
      const same =
        next !== null &&
        current !== null &&
        next.color === current.color &&
        next.width === current.width &&
        next.dash === current.dash
      if (same) continue
      flush(index)
      current = next
      start = index
    }
  }

  for (let row = 0; row <= rows; row++) {
    const y = ys[row] ?? 0
    run('h', row, cols, row === 0 || row === rows, (from, to) => ({
      x1: xs[from] ?? 0,
      y1: y,
      x2: xs[to] ?? 0,
      y2: y,
    }))
  }
  for (let col = 0; col <= cols; col++) {
    const x = xs[col] ?? 0
    run('v', col, rows, col === 0 || col === cols, (from, to) => ({
      x1: x,
      y1: ys[from] ?? 0,
      x2: x,
      y2: ys[to] ?? 0,
    }))
  }

  return (
    <svg
      className="of-table__lines"
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
    >
      {drawn}
    </svg>
  )
}

/**
 * The grid itself: the cells laid out, and the lines over them.
 *
 * Shared by the board and the editor, so what you edit is what is drawn — the
 * editor only swaps one cell's contents for a field.
 */
function TableGrid({
  data,
  style,
  width,
  height,
  label,
  content,
  cellProps,
}: {
  readonly data: TableData
  readonly style: ObjectStyle
  readonly width: number
  readonly height: number
  readonly label: string
  /** What goes in a cell; the board's text unless the editor says otherwise. */
  readonly content?: ((index: number, cell: TableCell) => ReactNode) | undefined
  readonly cellProps?:
    | ((index: number) => HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string>)
    | undefined
}) {
  const { columns, rows, cells, headerRow } = data
  const width_ = columns.length
  const merges = mergeIndex(data)
  // Placed explicitly only when something spans; otherwise the grid flows.
  const placed = merges.anchors.size > 0

  return (
    <div className="of-table-wrap">
      <div
        className="of-table"
        style={{
          gridTemplateColumns: tracks(columns),
          gridTemplateRows: tracks(rows),
          fontFamily: fontFamily(style.font),
          textAlign: textAlign(style.align),
          /*
           * A CUSTOM PROPERTY, because those inherit and `justify-content` does
           * not. This element is a grid, where `justify-content` distributes
           * tracks along the inline axis — so setting it here moved nothing at
           * all, and vertical alignment in a table did nothing until this line
           * changed. The cells read it in `.of-table__cell`.
           */
          ['--of-valign' as string]: verticalAlign(style.verticalAlign),
          /*
           * The table's colour is its GROUND — what every cell stands on
           * unless it has a fill of its own. Unset, it is the panel, which is
           * what a table always stood on and which follows After Hours.
           */
          ...(style.color === undefined ? {} : { background: surfaceOf(style.color, 'gray') }),
          // On the table, not on each cell: one declaration the cells inherit,
          // rather than a style object rebuilt per cell on every render.
          color: inkColor(style.textColor) ?? readableInkOn(style.color),
          opacity: style.opacity ?? 1,
        }}
        role="table"
        aria-label={label}
      >
        {cells.map((cell, index) => {
          if (merges.covered.has(index)) return null
          const row = Math.floor(index / width_)
          const col = index % width_
          const merge = merges.anchors.get(index)
          const head = headerRow && row === 0
          const paint = cellPaint(cell)
          return (
            <div
              // The index IS the identity: cells have no ids, and their
              // position is what they are.
              key={index}
              className={`of-table__cell${head ? ' of-table__cell--head' : ''}`}
              role={head ? 'columnheader' : 'cell'}
              {...(cellProps?.(index) ?? {})}
              style={
                placed
                  ? {
                      ...paint,
                      gridRow: `${String(row + 1)} / span ${String(merge?.rows ?? 1)}`,
                      gridColumn: `${String(col + 1)} / span ${String(merge?.cols ?? 1)}`,
                    }
                  : paint
              }
            >
              {content?.(index, cell) ?? (
                <div className="of-table__cell-text">
                  <RichTextView value={cell.text} />
                </div>
              )}
            </div>
          )
        })}
      </div>
      <GridLines data={data} style={style} width={width} height={height} />
    </div>
  )
}

const describeShape = (data: TableData): string =>
  `Table, ${String(data.columns.length)} columns by ${String(data.rows.length)} rows`

/**
 * A table: one object holding a grid.
 *
 * Laid out with CSS grid and `fr` units, which are exactly the weight model
 * the data uses — so the browser divides the frame and a resize needs no
 * recalculation at all.
 */
function TableRenderer({ object }: ObjectViewProps<TableData>) {
  return (
    <TableGrid
      data={object.data}
      style={object.style}
      width={object.frame.width}
      height={object.frame.height}
      label={describeShape(object.data)}
    />
  )
}

/*
 * ---------------------------------------------------------------------------
 * Editing a table, as a spreadsheet
 * ---------------------------------------------------------------------------
 */

interface Cell {
  readonly row: number
  readonly col: number
}

/** The column's letter, as a spreadsheet names it. Twenty-six is the most. */
const letter = (col: number): string => String.fromCharCode(65 + col)

/** The top-left of whatever merge a cell is in, or the cell itself. */
function anchorOf(data: TableData, cell: Cell): Cell {
  const merge = mergeAt(data, cell.row, cell.col)
  return merge === undefined ? cell : { row: merge.row, col: merge.col }
}

/**
 * One step from a cell, stepping OVER a merge rather than into its middle —
 * moving right out of a cell three columns wide lands in the fourth column,
 * as it looks like it should.
 */
function step(data: TableData, from: Cell, rows: number, cols: number): Cell {
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
interface Selection {
  readonly anchor: Cell
  readonly focus: Cell
}

/**
 * What the lower half of the cell bar edits: the cells' ground, their ink, or
 * the lines round them. One switch rather than a colour switch AND a borders
 * button, because only one of the three is ever on show — two controls that
 * each half-decided it read as though both applied at once.
 */
type CellTarget = 'fill' | 'text' | 'borders'
type ColourTarget = Exclude<CellTarget, 'borders'>

const CELL_TARGETS: readonly { key: CellTarget; label: string; name: string }[] = [
  { key: 'fill', label: 'fill', name: 'Cell background' },
  { key: 'text', label: 'text', name: 'Cell text colour' },
  { key: 'borders', label: 'borders', name: 'Borders' },
]

const CELL_KIND: Readonly<Record<ColourTarget, SwatchKind>> = { fill: 'surface', text: 'ink' }
const CELL_KEY: Readonly<Record<ColourTarget, keyof CellStyle>> = {
  fill: 'fill',
  text: 'textColor',
}

const PRESET_NAMES: Readonly<Record<LinePreset, string>> = {
  all: 'All lines',
  outer: 'Outer border',
  inner: 'Inner lines',
  horizontal: 'Inner horizontal',
  vertical: 'Inner vertical',
  top: 'Top',
  bottom: 'Bottom',
  left: 'Left',
  right: 'Right',
  none: 'No lines',
  reset: "The table's own lines",
}

const WEIGHTS: readonly StrokeToken[] = ['thin', 'medium', 'thick']
const DASHES: readonly DashToken[] = ['solid', 'dashed', 'dotted']

/** The screen size of the letter and number strips, in pixels. */
const STRIP = 22

/**
 * Editing the grid as a spreadsheet, committing ONE command.
 *
 * Two modes, as in every spreadsheet. NAVIGATING, a cell or a block of cells
 * is selected and the keyboard moves it; EDITING, one cell holds a caret. Only
 * that one cell is a field — every other is drawn exactly as the board draws
 * it — so inserting a row can never leave a field showing the text of the cell
 * that used to be where it is, which the old one-field-per-cell editor did.
 *
 * Everything goes into one draft: text, colours, lines, merges, rows and
 * columns. It reaches the document when the edit ends, so building a table is
 * one undo entry, one save and one network message (rules 3 and 4).
 */
function TableEditor({
  object,
  at,
  zoom,
  Chrome,
  Overlay,
  onCommit,
}: ObjectEditorProps<TableData>) {
  const [draft, setDraft] = useState<TableData>(object.data)
  const root = useRef<HTMLDivElement>(null)

  /*
   * Where it opens: in the cell somebody double-clicked, with a caret, or —
   * opened from the keyboard — on the first cell, navigating.
   */
  const [opened] = useState<Cell | null>(() => {
    if (at === null) return null
    const found = cellAt(object.data, object.frame, at)
    return found === null ? null : anchorOf(object.data, { row: found.row, col: found.column })
  })
  const start = opened ?? { row: 0, col: 0 }
  const [selection, setSelection] = useState<Selection>({ anchor: start, focus: start })
  const range = expandToMerges(draft, rangeBetween(selection.anchor, selection.focus))

  /*
   * The cell being typed in, and a counter so that editing the same cell
   * twice mounts a fresh field: a field reads its text once, on mount.
   */
  const [editing, setEditing] = useState<{
    readonly cell: Cell
    readonly before: RichText
    readonly seed: RichText
    readonly caret: 'end' | 'select-all'
    readonly turn: number
  } | null>(() =>
    opened === null
      ? null
      : {
          cell: opened,
          before: object.data.cells[opened.row * object.data.columns.length + opened.col]?.text ?? [
            { text: '' },
          ],
          seed: object.data.cells[opened.row * object.data.columns.length + opened.col]?.text ?? [
            { text: '' },
          ],
          caret: 'end',
          turn: 0,
        },
  )
  const field = useRef<RichTextFieldHandle | null>(null)
  const [format, setFormat] = useState<FormatState>({ marks: [], list: undefined })

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [target, setTarget] = useState<CellTarget>('fill')
  const borders = target === 'borders'
  const [pen, setPen] = useState<{ color?: ColorValue; weight: StrokeToken; dash: DashToken }>({
    weight: 'thin',
    dash: 'solid',
  })
  // What a drag started on, so moving over cells or strips extends the right thing.
  const dragging = useRef<'cells' | 'columns' | 'rows' | null>(null)

  const width = draft.columns.length
  const height = draft.rows.length
  const lastRow = height - 1
  const lastCol = width - 1

  useEffect(() => {
    if (opened === null) root.current?.focus()
    const end = (): void => {
      dragging.current = null
    }
    window.addEventListener('pointerup', end)
    return () => {
      window.removeEventListener('pointerup', end)
    }
  }, [opened])

  /*
   * A menu or the borders panel closes on a press anywhere else, as a menu
   * does. Capture phase: the canvas would otherwise consume the press first.
   */
  useEffect(() => {
    if (menu === null) return
    const dismiss = (event: Event): void => {
      if (event.target instanceof Element && event.target.closest('[data-table-popup]') !== null) {
        return
      }
      setMenu(null)
    }
    window.addEventListener('pointerdown', dismiss, true)
    return () => {
      window.removeEventListener('pointerdown', dismiss, true)
    }
  }, [menu])

  const commit = (data: TableData = draft): void => {
    onCommit({
      columns: data.columns,
      rows: data.rows,
      cells: data.cells,
      // Written out even when empty, so a merge or a line taken away in this
      // edit is taken away in the document too rather than merged back in.
      lines: data.lines ?? { h: [], v: [] },
      merges: data.merges ?? [],
    })
  }

  /** The keyboard back on the grid, so navigation keys keep arriving. */
  const home = (): void => {
    root.current?.focus()
  }

  const select = (anchor: Cell, focus: Cell = anchor): void => {
    setSelection({ anchor, focus })
  }

  const edit = (cell: Cell, seed?: RichText): void => {
    const anchor = anchorOf(draft, cell)
    const text = draft.cells[anchor.row * width + anchor.col]?.text ?? [{ text: '' }]
    select(anchor)
    setEditing((current) => ({
      cell: anchor,
      before: text,
      seed: seed ?? text,
      caret: 'end',
      turn: (current?.turn ?? 0) + 1,
    }))
    if (seed !== undefined) writeCell(anchor, seed)
  }

  /*
   * Opening a cell from the KEYBOARD mounts and focuses its field inside the
   * keydown, synchronously. Left to an effect, the keys typed straight after
   * the first arrived at the grid while the field was still mounting — each
   * one re-opening the cell with itself as the text, so "Owner" came out as
   * "r". Focused in time, a typed character's default action lands in the
   * field, which is how every spreadsheet on the web does it.
   */
  const openField = (cell: Cell, seed?: RichText): void => {
    flushSync(() => {
      edit(cell, seed)
    })
    const element = root.current?.querySelector<HTMLElement>('[data-testid="table-cell-field"]')
    if (element === null || element === undefined) return
    element.focus()
    const range = element.ownerDocument.createRange()
    range.selectNodeContents(element)
    range.collapse(false)
    const selection = element.ownerDocument.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  const writeCell = (cell: Cell, text: RichText): void => {
    setDraft((current) => {
      const index = cell.row * current.columns.length + cell.col
      return {
        ...current,
        cells: current.cells.map((old, other) => (other === index ? { ...old, text } : old)),
      }
    })
  }

  /** Stop typing, keep what was typed, and go on navigating. */
  const finishEditing = (): void => {
    home()
    setEditing(null)
  }

  const change = (next: TableData, keep: Selection = selection): void => {
    setDraft(next)
    const clamp = (cell: Cell): Cell => ({
      row: Math.min(cell.row, next.rows.length - 1),
      col: Math.min(cell.col, next.columns.length - 1),
    })
    setSelection({ anchor: clamp(keep.anchor), focus: clamp(keep.focus) })
  }

  /*
   * Rows and columns, anywhere. Inserting takes as many as are selected, as a
   * spreadsheet does, and the selection follows the tracks it had.
   */
  const insert = (axis: Axis, side: 'before' | 'after'): void => {
    const rows = axis === 'row'
    const count = rows ? range.bottom - range.top + 1 : range.right - range.left + 1
    const at = rows
      ? side === 'before'
        ? range.top
        : range.bottom + 1
      : side === 'before'
        ? range.left
        : range.right + 1
    const next = insertTracks(draft, axis, at, count)
    if (next === draft) return
    const shift = (cell: Cell): Cell =>
      side === 'before'
        ? rows
          ? { ...cell, row: cell.row + count }
          : { ...cell, col: cell.col + count }
        : cell
    change(next, { anchor: shift(selection.anchor), focus: shift(selection.focus) })
  }

  const remove = (axis: Axis): void => {
    const next =
      axis === 'row'
        ? deleteTracks(draft, 'row', range.top, range.bottom - range.top + 1)
        : deleteTracks(draft, 'column', range.left, range.right - range.left + 1)
    if (next === draft) return
    const corner = { row: range.top, col: range.left }
    change(next, { anchor: corner, focus: corner })
  }

  const cellsOf = (area: CellRange): number[] => indicesOf(draft, area)

  /** What every selected cell agrees on, or `undefined` if they do not. */
  const agreed = (key: keyof CellStyle): ColorValue | undefined => {
    const indices = cellsOf(range)
    const first = draft.cells[indices[0] ?? -1]?.[key]
    return indices.every((index) => draft.cells[index]?.[key] === first) ? first : undefined
  }

  const dress = (patch: Partial<Record<keyof CellStyle, ColorValue | null>>): void => {
    setDraft((current) => styleCells(current, indicesOf(current, range), patch))
  }

  const rule = (preset: LinePreset): void => {
    setDraft((current) =>
      setLines(current, range, preset, {
        ...(pen.color === undefined ? {} : { color: pen.color }),
        weight: pen.weight,
        ...(pen.dash === 'solid' ? {} : { dash: pen.dash }),
      }),
    )
  }

  /*
   * FORMATTING A RANGE, with no caret: what a spreadsheet does when you press
   * bold with a block of cells selected. Every cell's whole text, and the
   * button reads as on only when every one of them already is.
   */
  const rangeCells = (): TableCell[] =>
    indicesOf(draft, range)
      .map((index) => draft.cells[index])
      .filter((cell): cell is TableCell => cell !== undefined)
  const whole = (text: RichText): number => plainTextOf(text).length
  const reformat = (change: (text: RichText) => RichText): void => {
    setDraft((current) => {
      const touched = new Set(indicesOf(current, range))
      return {
        ...current,
        cells: current.cells.map((cell, index) =>
          touched.has(index) ? { ...cell, text: change(cell.text) } : cell,
        ),
      }
    })
  }
  const covers = (mark: Mark): boolean =>
    rangeCells().every(
      (cell) => whole(cell.text) === 0 || markCovers(cell.text, 0, whole(cell.text), mark),
    )
  const hasText = rangeCells().some((cell) => whole(cell.text) > 0)
  const listed = (): ListKind | undefined => {
    const kinds = rangeCells().map((cell) => listOf(cell.text, 0, whole(cell.text)))
    const first = kinds[0]
    return kinds.every((kind) => kind === first) ? first : undefined
  }
  const rangeFormat: FormatState = {
    marks: hasText ? MARKS.filter((mark) => covers(mark)) : [],
    list: listed(),
  }
  const toggleRangeMark = (mark: Mark): void => {
    const on = !covers(mark)
    reformat((text) => applyMark(text, 0, whole(text), mark, on))
  }
  const toggleRangeList = (kind: ListKind): void => {
    const next = listed() === kind ? undefined : kind
    reformat((text) => setList(text, 0, whole(text), next))
  }

  /** Right along the row, then on to the start of the next: reading order. */
  const tabFrom = (from: Cell, backward: boolean): Cell => {
    const merge = mergeAt(draft, from.row, from.col)
    const left = merge?.col ?? from.col
    const right = merge === undefined ? from.col : merge.col + merge.cols - 1
    const next = !backward
      ? right < lastCol
        ? step(draft, from, 0, 1)
        : { row: Math.min(lastRow, from.row + 1), col: 0 }
      : left > 0
        ? step(draft, from, 0, -1)
        : { row: Math.max(0, from.row - 1), col: lastCol }
    return anchorOf(draft, next)
  }

  /*
   * The spreadsheet's keys while a cell is being typed in. The field stops
   * every key from reaching the board, so these are claimed from inside it:
   * Tab moves on rather than nesting a list item, Enter finishes and moves
   * down, and Escape puts back what the cell said before.
   */
  const editingKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (editing === null) return
    if (event.key === 'Escape') {
      event.preventDefault()
      writeCell(editing.cell, editing.before)
      finishEditing()
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      finishEditing()
      select(anchorOf(draft, step(draft, editing.cell, 1, 0)))
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      finishEditing()
      select(tabFrom(editing.cell, event.shiftKey))
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    /*
     * Every key stops here. The board's keymap would otherwise read an arrow
     * as nudging the table, Delete as deleting it and a letter as a tool —
     * while the person is plainly working INSIDE it.
     */
    event.stopPropagation()
    const mod = event.metaKey || event.ctrlKey

    if (menu !== null) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMenu(null)
        home()
      }
      return
    }

    // The field handles its own keys (`editingKey`) and stops them there.
    if (editing !== null) return

    const moves: Record<string, readonly [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const move = moves[event.key]
    if (move !== undefined) {
      event.preventDefault()
      if (event.shiftKey) {
        setSelection({ ...selection, focus: step(draft, selection.focus, move[0], move[1]) })
      } else {
        select(anchorOf(draft, step(draft, selection.anchor, move[0], move[1])))
      }
      return
    }

    switch (event.key) {
      case 'Tab':
        event.preventDefault()
        select(tabFrom(selection.anchor, event.shiftKey))
        return
      case 'Enter':
      case 'F2':
        event.preventDefault()
        openField(selection.anchor)
        return
      case 'Delete':
      case 'Backspace':
        event.preventDefault()
        setDraft((current) => clearCells(current, range))
        return
      case 'Escape':
        event.preventDefault()
        commit()
        return
    }

    if (mod && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      select({ row: 0, col: 0 }, { row: lastRow, col: lastCol })
      return
    }

    /*
     * A character typed at a selected cell replaces it, as in a spreadsheet.
     * NOT prevented: the field is focused before this returns, so the
     * character itself is typed into it by the browser.
     */
    if (!mod && !event.altKey && event.key.length === 1) {
      openField(selection.anchor, [{ text: '' }])
    }
  }

  const editingIndex = editing === null ? -1 : editing.cell.row * width + editing.cell.col
  const xs = fractionsOf(draft.columns)
  const ys = fractionsOf(draft.rows)
  const region = (area: CellRange): Rect => ({
    x: xs[area.left] ?? 0,
    y: ys[area.top] ?? 0,
    width: (xs[area.right + 1] ?? 1) - (xs[area.left] ?? 0),
    height: (ys[area.bottom + 1] ?? 1) - (ys[area.top] ?? 0),
  })
  const selectedCount = cellsOf(range).length
  const merged = hasMerge(draft, range)
  const columnsSelected = range.top === 0 && range.bottom === lastRow
  const rowsSelected = range.left === 0 && range.right === lastCol

  const menuItems: readonly (readonly {
    label: string
    run: () => void
    disabled?: boolean
    testId: string
  }[])[] = [
    [
      { label: 'Insert row above', run: () => insert('row', 'before'), testId: 'row-above' },
      { label: 'Insert row below', run: () => insert('row', 'after'), testId: 'row-below' },
      { label: 'Insert column left', run: () => insert('column', 'before'), testId: 'column-left' },
      {
        label: 'Insert column right',
        run: () => insert('column', 'after'),
        testId: 'column-right',
      },
    ],
    [
      {
        label: range.bottom > range.top ? 'Delete rows' : 'Delete row',
        run: () => remove('row'),
        disabled: range.bottom - range.top + 1 >= height,
        testId: 'delete-rows',
      },
      {
        label: range.right > range.left ? 'Delete columns' : 'Delete column',
        run: () => remove('column'),
        disabled: range.right - range.left + 1 >= width,
        testId: 'delete-columns',
      },
    ],
    [
      {
        label: 'Merge cells',
        run: () => setDraft((current) => mergeRange(current, range)),
        disabled: selectedCount < 2,
        testId: 'merge',
      },
      {
        label: 'Unmerge',
        run: () => setDraft((current) => unmergeRange(current, range)),
        disabled: !merged,
        testId: 'unmerge',
      },
      {
        label: 'Clear contents',
        run: () => setDraft((current) => clearCells(current, range)),
        testId: 'clear',
      },
    ],
  ]

  return (
    <div
      ref={root}
      className="of-table-edit of-editor-chrome"
      data-testid="table-editor"
      data-mode={editing === null ? 'navigate' : 'edit'}
      tabIndex={-1}
      role="grid"
      aria-label={describeShape(draft)}
      aria-multiselectable="true"
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        /*
         * Committed only when focus leaves the whole editor — not when it
         * moves between the grid, a cell's field and the bars. The apparatus
         * is PORTALED out of this element, so `contains` says a press on a
         * swatch left the editor; the layer is the editor as far as focus is
         * concerned (rule 15's DOM fallback).
         */
        const next = event.relatedTarget
        if (next instanceof Node && event.currentTarget.contains(next)) return
        if (next instanceof Element && next.closest('[data-chrome-layer]') !== null) return
        commit()
      }}
    >
      <TableGrid
        data={draft}
        style={object.style}
        width={object.frame.width}
        height={object.frame.height}
        label={describeShape(draft)}
        cellProps={(index) => {
          const row = Math.floor(index / width)
          const col = index % width
          return {
            'data-testid': `table-cell-${String(index)}`,
            'aria-selected':
              row >= range.top && row <= range.bottom && col >= range.left && col <= range.right,
            onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
              if (event.button !== 0 || index === editingIndex) return
              // Not the browser's text selection across cells, nor its focus.
              event.preventDefault()
              if (editing !== null) finishEditing()
              else home()
              const cell = { row, col }
              if (event.shiftKey) setSelection({ ...selection, focus: cell })
              else select(cell)
              dragging.current = 'cells'
            },
            onPointerEnter: (event: ReactPointerEvent<HTMLDivElement>) => {
              if (dragging.current !== 'cells' || (event.buttons & 1) === 0) return
              setSelection((current) => ({ ...current, focus: { row, col } }))
            },
            onDoubleClick: () => {
              if (index !== editingIndex) edit({ row, col })
            },
            onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => {
              // The table's menu, not the board's.
              event.preventDefault()
              event.stopPropagation()
              const inside =
                row >= range.top && row <= range.bottom && col >= range.left && col <= range.right
              if (!inside) select({ row, col })
              const grid = event.currentTarget.parentElement
              if (grid === null) return
              const box = grid.getBoundingClientRect()
              setMenu({
                x: (event.clientX - box.left) / box.width,
                y: (event.clientY - box.top) / box.height,
              })
            },
          }
        }}
        content={(index, cell) =>
          index === editingIndex && editing !== null ? (
            <RichTextField
              key={`${String(editing.turn)}`}
              handle={field}
              initialText={editing.seed}
              className="of-table__input"
              focusOnMount={editing.caret}
              ariaLabel={`${letter(editing.cell.col)}${String(editing.cell.row + 1)}`}
              testId="table-cell-field"
              // Enter finishes; a new line — and a new list item — is Shift+Enter.
              newParagraph="Shift+Enter"
              onKeyDown={editingKey}
              onFormatState={setFormat}
              onChange={(text) => {
                writeCell(editing.cell, text)
              }}
            />
          ) : (
            <div className="of-table__cell-text">
              <RichTextView value={cell.text} />
            </div>
          )
        }
      />

      {/*
       * The spreadsheet's own apparatus, drawn exactly ON the table in
       * screen space: the letters over the columns, the numbers beside the
       * rows, and the ring round the selection. Screen space because a ring
       * divided by the zoom stops getting thinner at one world pixel (rule
       * 24), and exact because a letter a few pixels off its column names
       * the wrong one.
       */}
      <Overlay>
        {(place) => {
          const table = place({ x: 0, y: 0, width: 1, height: 1 })
          const ring = place(region(range))
          const cursor = place(
            region(expandToMerges(draft, rangeBetween(selection.anchor, selection.anchor))),
          )
          const strip = (
            axis: 'columns' | 'rows',
            index: number,
            onDown: (extend: boolean) => void,
          ): ReactNode => {
            const box =
              axis === 'columns'
                ? place({
                    x: xs[index] ?? 0,
                    y: 0,
                    width: (xs[index + 1] ?? 1) - (xs[index] ?? 0),
                    height: 0,
                  })
                : place({
                    x: 0,
                    y: ys[index] ?? 0,
                    width: 0,
                    height: (ys[index + 1] ?? 1) - (ys[index] ?? 0),
                  })
            const on =
              axis === 'columns'
                ? index >= range.left && index <= range.right && columnsSelected
                : index >= range.top && index <= range.bottom && rowsSelected
            const within =
              axis === 'columns'
                ? index >= range.left && index <= range.right
                : index >= range.top && index <= range.bottom
            return (
              <button
                key={`${axis}${String(index)}`}
                type="button"
                tabIndex={-1}
                className={`of-table-strip__item${on ? ' of-table-strip__item--on' : within ? ' of-table-strip__item--within' : ''}`}
                data-testid={
                  axis === 'columns'
                    ? `table-column-${letter(index)}`
                    : `table-row-${String(index + 1)}`
                }
                aria-label={
                  axis === 'columns' ? `Column ${letter(index)}` : `Row ${String(index + 1)}`
                }
                aria-pressed={on}
                style={
                  axis === 'columns'
                    ? { left: box.x, top: table.y - STRIP - 2, width: box.width, height: STRIP }
                    : {
                        left: table.x - STRIP - 10,
                        top: box.y,
                        width: STRIP + 8,
                        height: box.height,
                      }
                }
                onMouseDown={(event) => {
                  event.preventDefault()
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  if (editing !== null) finishEditing()
                  else home()
                  onDown(event.shiftKey)
                  dragging.current = axis
                }}
                onPointerEnter={(event) => {
                  if (dragging.current !== axis || (event.buttons & 1) === 0) return
                  setSelection((current) => ({
                    ...current,
                    focus:
                      axis === 'columns'
                        ? { row: lastRow, col: index }
                        : { row: index, col: lastCol },
                  }))
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (!within) onDown(false)
                  setMenu(
                    axis === 'columns'
                      ? {
                          x: (xs[index] ?? 0) + ((xs[index + 1] ?? 1) - (xs[index] ?? 0)) / 2,
                          y: 0,
                        }
                      : {
                          x: 0,
                          y: (ys[index] ?? 0) + ((ys[index + 1] ?? 1) - (ys[index] ?? 0)) / 2,
                        },
                  )
                }}
              >
                {axis === 'columns' ? letter(index) : String(index + 1)}
              </button>
            )
          }
          return (
            <>
              <div
                className={`of-table-ring${selectedCount > 1 ? ' of-table-ring--range' : ''}`}
                data-testid="table-selection"
                style={{ left: ring.x, top: ring.y, width: ring.width, height: ring.height }}
              />
              {selectedCount > 1 && (
                <div
                  className="of-table-ring of-table-ring--cursor"
                  style={{
                    left: cursor.x,
                    top: cursor.y,
                    width: cursor.width,
                    height: cursor.height,
                  }}
                />
              )}
              <div className="of-table-strip" role="presentation">
                <button
                  type="button"
                  tabIndex={-1}
                  className="of-table-strip__item of-table-strip__corner"
                  aria-label="Select the whole table"
                  data-testid="table-select-all"
                  style={{
                    left: table.x - STRIP - 10,
                    top: table.y - STRIP - 2,
                    width: STRIP + 8,
                    height: STRIP,
                  }}
                  onMouseDown={(event) => {
                    event.preventDefault()
                  }}
                  onPointerDown={() => {
                    if (editing !== null) finishEditing()
                    else home()
                    select({ row: 0, col: 0 }, { row: lastRow, col: lastCol })
                  }}
                />
                {draft.columns.map((_, index) =>
                  strip('columns', index, (extend) => {
                    if (extend) {
                      setSelection({
                        anchor: { row: 0, col: selection.anchor.col },
                        focus: { row: lastRow, col: index },
                      })
                    } else {
                      select({ row: 0, col: index }, { row: lastRow, col: index })
                    }
                  }),
                )}
                {draft.rows.map((_, index) =>
                  strip('rows', index, (extend) => {
                    if (extend) {
                      setSelection({
                        anchor: { row: selection.anchor.row, col: 0 },
                        focus: { row: index, col: lastCol },
                      })
                    } else {
                      select({ row: index, col: 0 }, { row: index, col: lastCol })
                    }
                  }),
                )}
              </div>
            </>
          )
        }}
      </Overlay>

      {menu !== null && (
        <Chrome
          anchor={{ x: menu.x, y: menu.y, width: 0, height: 0 }}
          prefer={['below', 'above', 'right', 'left']}
        >
          <div
            className="of-menu of-surface"
            role="menu"
            aria-label="Table"
            data-testid="table-menu"
            data-table-popup
            onMouseDown={(event) => {
              event.preventDefault()
            }}
          >
            {menuItems.map((group, index) => (
              <div key={index} className="of-menu__group">
                {group.map((item) => (
                  <button
                    key={item.testId}
                    type="button"
                    role="menuitem"
                    className="of-menu__item"
                    disabled={item.disabled === true}
                    data-testid={`table-menu-${item.testId}`}
                    onClick={() => {
                      /*
                       * The cell being typed in is finished FIRST. Its text is
                       * already in the draft; left open, the field stayed
                       * pinned to its old coordinates while an insert above or
                       * to the left moved the cells under it, and showed one
                       * cell's words over another.
                       */
                      if (editing !== null) finishEditing()
                      item.run()
                      setMenu(null)
                      home()
                    }}
                  >
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Chrome>
      )}

      {/*
       * THE CELL BAR, acting on the selection.
       *
       * Here rather than in the record panel: the panel's fields come from
       * the registry's `styleProps` and apply to whole OBJECTS. A cell is
       * not one, and teaching the panel about "the selected cells of the
       * selected table" would put type knowledge in the one component that
       * exists to have none — rule 21.
       *
       * Anchored to the WHOLE table and its letters and numbers, never to the
       * selected cells: a bar anchored to the cells that found no room above
       * dropped onto the very rows a shift-click was reaching for, and one
       * that fell back to their side covered the next column.
       */}
      <Chrome
        anchor={{
          x: -(STRIP + 10) / Math.max(1, object.frame.width * zoom),
          y: -(STRIP + 4) / Math.max(1, object.frame.height * zoom),
          width: 1 + (STRIP + 10) / Math.max(1, object.frame.width * zoom),
          height: 1 + (STRIP + 4) / Math.max(1, object.frame.height * zoom),
        }}
        /*
         * Beside the table when neither above nor below has the room — a
         * table on a short window — rather than clamped on top of the very
         * cells it is changing.
         */
        prefer={['above', 'below', 'right', 'left']}
      >
        <div
          className="of-cellbar of-surface"
          data-testid="table-cell-style"
          data-table-popup
          /*
           * A press on any BUTTON here leaves the caret where it was: pick a
           * colour, keep typing. Only buttons — the custom colour's hex field
           * has to be able to take focus to be typed in.
           */
          onMouseDown={(event) => {
            if (event.target instanceof Element && event.target.closest('button') !== null) {
              event.preventDefault()
            }
          }}
        >
          {/*
           * The format bar every text has. It drives the cell with the caret;
           * with none, it has nothing to act on and says so by being off.
           */}
          <FormatBar
            embedded
            state={editing === null ? rangeFormat : format}
            onToggle={(mark) => {
              if (editing !== null) field.current?.toggleMark(mark)
              else toggleRangeMark(mark)
            }}
            onResize={(by) => {
              if (editing !== null) field.current?.resize(by)
              else
                reformat((text) => {
                  const end = plainTextOf(text).length
                  const next = stepSize(sizeOfRange(text, 0, end), by)
                  return applySize(text, 0, end, next === DEFAULT_SIZE ? undefined : next)
                })
            }}
            onList={(kind) => {
              if (editing !== null) field.current?.toggleList(kind)
              else toggleRangeList(kind)
            }}
          />
          <div className="of-cellbar__head">
            <span className="of-cellbar__count" data-testid="table-selection-count">
              {selectedCount === 1 ? '1 cell' : `${String(selectedCount)} cells`}
            </span>
            <div
              className="of-choice of-choice--text of-cellbar__target"
              role="group"
              aria-label="What to change"
            >
              {CELL_TARGETS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`of-choice__item${target === option.key ? ' of-choice__item--on' : ''}`}
                  aria-pressed={target === option.key}
                  data-testid={`cell-target-${option.key}`}
                  onClick={() => {
                    setTarget(option.key)
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="of-button of-button--ghost of-cellbar__more"
              aria-haspopup="menu"
              aria-expanded={menu !== null}
              aria-label="Rows, columns and merging"
              data-tip="Rows, columns and merging"
              data-testid="cell-table-menu"
              onClick={() => {
                setMenu((open) =>
                  open === null
                    ? { x: region(range).x + region(range).width, y: region(range).y }
                    : null,
                )
              }}
            >
              ···
            </button>
            {!borders && (
              <button
                type="button"
                className="of-button of-button--ghost of-cellbar__clear"
                data-tip="Use the table's own colours"
                aria-description="Use the table's own colours"
                data-testid="cell-clear"
                onClick={() => {
                  dress({ fill: null, textColor: null })
                }}
              >
                Reset
              </button>
            )}
          </div>

          {target === 'borders' ? (
            <div
              className="of-borders"
              data-testid="cell-borders-panel"
              role="group"
              aria-label="Borders"
            >
              <div className="of-borders__presets" role="group" aria-label="Which lines">
                {LINE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="of-icon-button"
                    aria-label={PRESET_NAMES[preset]}
                    data-tip={PRESET_NAMES[preset]}
                    data-testid={`borders-${preset}`}
                    onClick={() => {
                      rule(preset)
                    }}
                  >
                    <BorderPresetIcon preset={preset} />
                  </button>
                ))}
              </div>
              <div className="of-borders__pen">
                <div className="of-choice" role="group" aria-label="Line weight">
                  {WEIGHTS.map((weight) => (
                    <button
                      key={weight}
                      type="button"
                      className={`of-choice__item${pen.weight === weight ? ' of-choice__item--on' : ''}`}
                      aria-pressed={pen.weight === weight}
                      aria-label={`${weight} line`}
                      data-testid={`borders-weight-${weight}`}
                      onClick={() => {
                        setPen((current) => ({ ...current, weight }))
                      }}
                    >
                      <StrokeIcon variant={weight} />
                    </button>
                  ))}
                </div>
                <div className="of-choice" role="group" aria-label="Line pattern">
                  {DASHES.map((dash) => (
                    <button
                      key={dash}
                      type="button"
                      className={`of-choice__item${pen.dash === dash ? ' of-choice__item--on' : ''}`}
                      aria-pressed={pen.dash === dash}
                      aria-label={`${dash} line`}
                      data-testid={`borders-dash-${dash}`}
                      onClick={() => {
                        setPen((current) => ({ ...current, dash }))
                      }}
                    >
                      <DashIcon variant={dash} />
                    </button>
                  ))}
                </div>
              </div>
              <Swatches
                kind="line"
                label="Line colour"
                testPrefix="borders-color"
                current={pen.color}
                against={groundOf(agreed('fill'))}
                onPick={(colour) => {
                  setPen((current) => ({ ...current, color: colour }))
                }}
              />
            </div>
          ) : (
            <Swatches
              kind={CELL_KIND[target]}
              label={CELL_TARGETS.find((option) => option.key === target)?.name ?? 'Colour'}
              testPrefix={`cell-${target}`}
              current={agreed(CELL_KEY[target])}
              against={target === 'fill' ? null : groundOf(agreed('fill'))}
              onPick={(colour) => {
                dress({ [CELL_KEY[target]]: colour })
              }}
            />
          )}
        </div>
      </Chrome>
    </div>
  )
}

export const tableView = defineObjectView<TableData>({
  type: 'table',
  Renderer: TableRenderer,
  InlineEditor: TableEditor,
})
