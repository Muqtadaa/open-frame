import {
  useEffect,
  useRef,
  useState,
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
  markTouches,
  plainTextOf,
  setList,
  deleteTracks,
  expandToMerges,
  hasMerge,
  indicesOf,
  insertTracks,
  mergeAt,
  mergeRange,
  rangeBetween,
  setLines,
  setTrackSize,
  styleCells,
  unmergeRange,
  type Axis,
  type CellRange,
  ALIGN_TOKENS,
  VALIGN_TOKENS,
  type AlignToken,
  type CellStyle,
  type CellStylePatch,
  type ColorValue,
  type VAlignToken,
  type DashToken,
  type LinePreset,
  type ListKind,
  type Mark,
  type Rect,
  type RichText,
  type SizeToken,
  type StrokeToken,
  type TableCell,
  type TableData,
} from '@openframe/core'
import {
  defineObjectView,
  type ObjectEditorProps,
  type ObjectTool,
  type ObjectViewProps,
} from './registry.js'
import { TableSizePicker, type TableSize } from '../controls/TableSizePicker.js'
import { FormatBar } from './FormatBar.js'
import {
  RichTextField,
  sizeOfRange,
  sizeReadout,
  stepSize,
  type FormatState,
  type RichTextFieldHandle,
} from './RichTextField.js'
import { RichTextView } from './RichTextView.js'
import { cellAt } from '../scene/table-grid.js'
import { cellsInTrack, fitColumnWidth, fitRowHeight } from '../scene/fit-track.js'
import { Swatches, groundOf, type SwatchKind } from '../controls/Swatches.js'
import {
  AlignIcon,
  BorderPresetIcon,
  DashIcon,
  StrokeIcon,
  TableIcon,
  VAlignIcon,
} from '../controls/icons.js'
import { lineClamp } from './line-clamp.js'
import { openingRange } from './rich-text-dom.js'
import { CellChoice } from './table/CellChoice.js'
import { TableGrid, describeShape } from './table/TableGrid.js'
import { type Cell, type Selection, anchorOf, letter, step } from './table/cells.js'
import { fractionsOf } from './table/geometry.js'

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
const CELL_KEY: Readonly<Record<ColourTarget, 'fill' | 'textColor'>> = {
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
/** How wide a boundary between two letters is to grab, in screen pixels. */
const GRIP = 10

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
  /*
   * The draft's SIZE, in world units. Fitting or dragging a track changes one
   * track and leaves the rest as they are, so the table grows or shrinks to
   * hold it — and that lands with the rest of the edit, as one undo entry.
   */
  const [size, setSize] = useState({ width: object.frame.width, height: object.frame.height })
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
    readonly seed: RichText
    readonly caret: 'end' | 'select-all'
    readonly turn: number
  } | null>(() =>
    opened === null
      ? null
      : {
          cell: opened,
          seed: object.data.cells[opened.row * object.data.columns.length + opened.col]?.text ?? [
            { text: '' },
          ],
          caret: 'end',
          turn: 0,
        },
  )
  const field = useRef<RichTextFieldHandle | null>(null)
  const [format, setFormat] = useState<FormatState>({ marks: [], list: undefined, size: undefined })

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
    onCommit(
      {
        columns: data.columns,
        rows: data.rows,
        cells: data.cells,
        // Written out even when empty, so a merge or a line taken away in this
        // edit is taken away in the document too rather than merged back in.
        lines: data.lines ?? { h: [], v: [] },
        merges: data.merges ?? [],
      },
      size,
    )
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
    // Inside the paragraph, not beside it: Firefox types the first key
    // wherever the caret is, and a caret on the field itself left the cell
    // reading as a blank line and then the text.
    const selection = element.ownerDocument.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(openingRange(element, 'end'))
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
  const agreed = <K extends keyof CellStyle>(key: K): CellStyle[K] | undefined => {
    const indices = cellsOf(range)
    const first = draft.cells[indices[0] ?? -1]?.[key]
    return indices.every((index) => draft.cells[index]?.[key] === first) ? first : undefined
  }

  const dress = (patch: CellStylePatch): void => {
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
  const touches = (mark: Mark): boolean =>
    rangeCells().some((cell) => markTouches(cell.text, 0, whole(cell.text), mark))
  const hasText = rangeCells().some((cell) => whole(cell.text) > 0)
  const listed = (): ListKind | undefined => {
    const kinds = rangeCells().map((cell) => listOf(cell.text, 0, whole(cell.text)))
    const first = kinds[0]
    return kinds.every((kind) => kind === first) ? first : undefined
  }
  const sized = (): SizeToken | undefined => {
    const sizes = rangeCells().map((cell) => sizeReadout(cell.text, 0, whole(cell.text)))
    const first = sizes[0]
    return sizes.every((size) => size === first) ? first : undefined
  }
  const rangeFormat: FormatState = {
    marks: hasText ? MARKS.filter((mark) => covers(mark)) : [],
    mixed: hasText ? MARKS.filter((mark) => !covers(mark) && touches(mark)) : [],
    list: listed(),
    size: sized(),
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
   * down, and Escape goes back to moving between cells KEEPING what was
   * typed. It used to put back what the cell said before — one key throwing
   * away words, the same fault every other editor on the board had.
   */
  const editingKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (editing === null) return
    if (event.key === 'Escape') {
      event.preventDefault()
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
  /*
   * Fractions of the OBJECT, which is what apparatus is placed against —
   * so a draft grown past it runs past 1, and the letters stay over their
   * columns while the table is wider than the object it will become.
   */
  const sx = size.width / Math.max(1, object.frame.width)
  const sy = size.height / Math.max(1, object.frame.height)
  const xs = fractionsOf(draft.columns).map((at) => at * sx)
  const ys = fractionsOf(draft.rows).map((at) => at * sy)

  /**
   * One track set to an exact size, in world units, into the draft. The same
   * arithmetic as a boundary dragged from outside the editor (`setTrackSize`):
   * this track changes, every other keeps its size, and the table grows.
   */
  const sizeTrack = (
    axis: Axis,
    index: number,
    wanted: number,
    from: { readonly weights: readonly number[]; readonly extent: number } = {
      weights: axis === 'column' ? draft.columns : draft.rows,
      extent: axis === 'column' ? size.width : size.height,
    },
  ): void => {
    const sized = setTrackSize(from.weights, index, wanted, from.extent)
    if (sized === null) return
    setDraft((current) =>
      axis === 'column'
        ? { ...current, columns: sized.weights }
        : { ...current, rows: sized.weights },
    )
    setSize((current) =>
      axis === 'column' ? { ...current, width: sized.total } : { ...current, height: sized.total },
    )
  }

  /** Double-clicking a boundary: the track before it fitted to what is in it. */
  const fit = (axis: Axis, index: number): void => {
    const grid = root.current?.querySelector('[role="table"]')
    if (grid === null || grid === undefined) return
    const cells = cellsInTrack(grid, axis, index)
    const wanted = axis === 'column' ? fitColumnWidth(cells) : fitRowHeight(cells)
    if (wanted !== null) sizeTrack(axis, index, wanted)
  }

  // A boundary being dragged, and what it started from.
  const resizing = useRef<{
    readonly axis: Axis
    readonly index: number
    readonly start: number
    readonly track: number
    readonly weights: readonly number[]
    readonly extent: number
  } | null>(null)
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
        width={size.width}
        height={size.height}
        sized
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
                x: ((event.clientX - box.left) / box.width) * sx,
                y: ((event.clientY - box.top) / box.height) * sy,
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
            <div className="of-table__cell-text" data-testid="table-cell-text" ref={lineClamp}>
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
          const table = place({ x: 0, y: 0, width: sx, height: sy })
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
                {/*
                 * The boundaries between the letters and between the
                 * numbers, where a spreadsheet puts them: drag one to size
                 * the track before it, double-click it to fit that track to
                 * its content. After every track, the last included — the
                 * table's own edge is how the last column is sized.
                 */}
                {(['column', 'row'] as const).flatMap((axis) =>
                  (axis === 'column' ? draft.columns : draft.rows).map((_, index) => {
                    const edge =
                      axis === 'column'
                        ? place({ x: xs[index + 1] ?? sx, y: 0, width: 0, height: 0 })
                        : place({ x: 0, y: ys[index + 1] ?? sy, width: 0, height: 0 })
                    const name =
                      axis === 'column' ? `column ${letter(index)}` : `row ${String(index + 1)}`
                    return (
                      <div
                        key={`${axis}-grip-${String(index)}`}
                        className={`of-table-strip__grip of-table-strip__grip--${axis}`}
                        role="separator"
                        aria-orientation={axis === 'column' ? 'vertical' : 'horizontal'}
                        aria-label={`Edge of ${name}`}
                        data-tip={`Resize ${name} · double-click to fit`}
                        aria-description={`Resize ${name} · double-click to fit`}
                        data-testid={
                          axis === 'column'
                            ? `table-column-edge-${letter(index)}`
                            : `table-row-edge-${String(index + 1)}`
                        }
                        style={
                          axis === 'column'
                            ? {
                                left: edge.x - GRIP / 2,
                                top: table.y - STRIP - 2,
                                width: GRIP,
                                height: STRIP,
                              }
                            : {
                                left: table.x - STRIP - 10,
                                top: edge.y - GRIP / 2,
                                width: STRIP + 8,
                                height: GRIP,
                              }
                        }
                        onMouseDown={(event) => {
                          event.preventDefault()
                        }}
                        onPointerDown={(event) => {
                          if (event.button !== 0) return
                          event.stopPropagation()
                          if (editing !== null) finishEditing()
                          else home()
                          const weights = axis === 'column' ? draft.columns : draft.rows
                          const extent = axis === 'column' ? size.width : size.height
                          const total = weights.reduce((sum, weight) => sum + weight, 0)
                          resizing.current = {
                            axis,
                            index,
                            start: axis === 'column' ? event.clientX : event.clientY,
                            track: ((weights[index] ?? 0) / Math.max(total, 1e-9)) * extent,
                            weights,
                            extent,
                          }
                          event.currentTarget.setPointerCapture(event.pointerId)
                        }}
                        onPointerMove={(event) => {
                          const drag = resizing.current
                          if (drag?.axis !== axis || drag.index !== index) return
                          const now = axis === 'column' ? event.clientX : event.clientY
                          // Screen pixels to world units: the grip is apparatus, the track is not.
                          const moved = (now - drag.start) / zoom
                          if (moved === 0) return
                          sizeTrack(axis, index, drag.track + moved, drag)
                        }}
                        onPointerUp={(event) => {
                          resizing.current = null
                          event.currentTarget.releasePointerCapture(event.pointerId)
                        }}
                        onDoubleClick={() => {
                          fit(axis, index)
                        }}
                      />
                    )
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
          width: sx + (STRIP + 10) / Math.max(1, object.frame.width * zoom),
          height: sy + (STRIP + 4) / Math.max(1, object.frame.height * zoom),
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
            onReturn={() => {
              if (editing !== null) field.current?.focus()
            }}
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
                aria-label="Reset"
                data-tip="Back to the table's style"
                aria-description="Back to the table's style"
                data-testid="cell-clear"
                onClick={() => {
                  dress({ fill: null, textColor: null, align: null, verticalAlign: null })
                }}
              >
                Reset
              </button>
            )}
          </div>

          {/*
            Alignment, per cell, over the table's own. Always shown rather than
            a target like the colours: it is one row of six, and a column of
            figures is aligned as often as it is coloured.
          */}
          <div className="of-cellbar__align">
            <CellChoice<AlignToken>
              label="Align across"
              name="cell-align"
              options={ALIGN_TOKENS}
              current={agreed('align') ?? object.style.align ?? 'start'}
              onPick={(align) => {
                dress({ align })
              }}
              render={(token) => <AlignIcon variant={token} />}
            />
            <CellChoice<VAlignToken>
              label="Align down"
              name="cell-valign"
              options={VALIGN_TOKENS}
              current={agreed('verticalAlign') ?? object.style.verticalAlign ?? 'top'}
              onPick={(verticalAlign) => {
                dress({ verticalAlign })
              }}
              render={(token) => <VAlignIcon variant={token} />}
            />
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

/**
 * Placed where you press, at the size chosen first — pressing the armed
 * button opens the grid. G, because a table is a grid and T was taken.
 */
const tableTool: ObjectTool<TableSize> = {
  label: 'Table',
  keys: ['g'],
  order: 60,
  place: 'click',
  initial: { columns: 3, rows: 3 },
  /*
   * Equal WEIGHTS, one per column and row. The registry builds the cells to
   * match, so the count lives in exactly one place — the length of these two
   * arrays — and nothing downstream has to be told the shape twice.
   */
  data: (size) => ({
    columns: Array.from({ length: size.columns }, () => 1),
    rows: Array.from({ length: size.rows }, () => 1),
  }),
  cursor: () => ({
    body: 'M5.5 4.5h13a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17V7a2.5 2.5 0 0 1 2.5-2.5z',
    detail: 'M3 9.6h18M3 14.4h18M9.6 9.6v9.9M15.4 9.6v9.9',
  }),
  Icon: () => <TableIcon />,
  options: {
    label: 'Choose table size',
    popup: 'grid',
    testIds: { disclosure: 'table-menu', surface: 'table-size-flyout' },
    Picker: ({ options, choose }) => (
      <div className="of-flyout of-flyout--wide">
        <TableSizePicker size={options} onChoose={choose} />
      </div>
    ),
  },
}

export const tableView = defineObjectView<TableData, TableSize>({
  type: 'table',
  tool: tableTool,
  Renderer: TableRenderer,
  InlineEditor: TableEditor,
})
