import { useState, type CSSProperties } from 'react'

import {
  cellRange,
  plainTextOf,
  resizeGrid,
  styleCells,
  type CellStyle,
  type ColorValue,
  type TableCell,
  type TableData,
} from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { RichTextView } from './RichTextView.js'
import { cellAt, tracks } from '../scene/table-grid.js'
import { fontFamily, textAlign, inkColor, inkOf, surfaceOf } from '../scene/style-tokens.js'
import { Swatches, groundOf } from '../controls/Swatches.js'

/**
 * One cell's own colours, as a style object, or `undefined` for none.
 *
 * `undefined` rather than an empty object: React treats `style={{}}` as a
 * value that changed on every render, and this runs once per cell per frame on
 * a grid that may hold hundreds.
 */
function cellPaint(cell: TableCell): CSSProperties | undefined {
  if (cell.fill === undefined && cell.textColor === undefined && cell.border === undefined) {
    return undefined
  }
  return {
    ...(cell.fill === undefined ? {} : { background: surfaceOf(cell.fill, 'gray') }),
    ...(cell.textColor === undefined ? {} : { color: inkOf(cell.textColor) }),
    ...(cell.border === undefined ? {} : { borderColor: inkOf(cell.border) }),
  }
}

/**
 * A table: one object holding a grid.
 *
 * Laid out with CSS grid and `fr` units, which are exactly the weight model
 * the data uses — so the browser divides the frame and a resize needs no
 * recalculation at all.
 */
function TableRenderer({ object }: ObjectViewProps<TableData>) {
  const { columns, rows, cells, headerRow } = object.data

  return (
    <div
      className="of-table"
      style={{
        gridTemplateColumns: tracks(columns),
        gridTemplateRows: tracks(rows),
        fontFamily: fontFamily(object.style.font),
        textAlign: textAlign(object.style.align),
        // On the table, not on each cell: one declaration the cells inherit,
        // rather than a style object rebuilt per cell on every render.
        color: inkColor(object.style.textColor),
        opacity: object.style.opacity ?? 1,
      }}
      role="table"
      aria-label={`Table, ${String(columns.length)} columns by ${String(rows.length)} rows`}
    >
      {cells.map((cell, index) => {
        const row = Math.floor(index / columns.length)
        return (
          <div
            // The index IS the identity: cells have no ids, and their position
            // is what they are.
            key={index}
            className={`of-table__cell${headerRow && row === 0 ? ' of-table__cell--head' : ''}`}
            role={headerRow && row === 0 ? 'columnheader' : 'cell'}
            /*
             * A cell's own colours, or nothing at all. Absent means "the
             * table's", and an absent CSS property is exactly that — writing
             * the table's current colour into each cell would stop the cell
             * following it.
             */
            style={cellPaint(cell)}
          >
            <RichTextView value={cell.text} />
          </div>
        )
      })}
    </div>
  )
}

/**
 * Editing the grid: its contents AND its shape, committing ONE command.
 *
 * Adding a column while editing changes only this draft. It reaches the
 * document when the edit ends, together with whatever was typed — so building
 * a table is one undo entry, one save and one network message rather than one
 * per keystroke and one per column.
 *
 * The alternative was dispatching each shape change immediately, which closes
 * the editor every time: adding three columns would mean re-opening it three
 * times.
 */
function TableEditor({ object, at, onCommit, onCancel }: ObjectEditorProps<TableData>) {
  /*
   * The whole table as a draft, not just its text. `resizeGrid` moves the
   * weights and the cells together, which is the only way the two cannot
   * disagree — and it is the same function the tests exercise directly.
   */
  const [draft, setDraft] = useState<TableData>(object.data)

  /*
   * Which cell the caret starts in, decided ONCE when the editor opens.
   *
   * A `useState` initialiser rather than a ref, because a ref read during
   * render is a render that depends on something React does not track — and
   * this value is read while deciding which field carries `autoFocus`.
   */
  const [started] = useState(() => {
    if (at === null) return 0
    const found = cellAt(object.data, object.frame, at)
    return found === null ? 0 : found.row * object.data.columns.length + found.column
  })

  /*
   * The cell range being dressed: an anchor and a focus, in the spreadsheet
   * sense. Click sets both; shift-click moves the focus and the rectangle
   * between them is what a colour lands on.
   *
   * Shift-click rather than drag-select, and that is a real trade. A cell is a
   * `textarea`, so a pointer drag inside one is the browser selecting TEXT —
   * taking that over would mean the cells stop being fields until something
   * says otherwise, which is a bigger rework of typing than this feature
   * earns. Shift-click is what a spreadsheet already teaches.
   */
  const [anchor, setAnchor] = useState(started)
  const [focus, setFocus] = useState(started)
  const selected = cellRange(draft, anchor, focus)
  const inRange = new Set(selected)

  const commit = (): void => {
    onCommit({ columns: draft.columns, rows: draft.rows, cells: draft.cells })
  }

  /**
   * Dresses the selected cells.
   *
   * Into the DRAFT, like everything else in this editor, so colouring three
   * cells and typing in a fourth is one command, one undo entry and one
   * network message when the editor closes.
   */
  const dress = (patch: Partial<Record<keyof CellStyle, ColorValue | null>>): void => {
    setDraft((current) => styleCells(current, cellRange(current, anchor, focus), patch))
  }

  /** What the selection agrees on, or `undefined` if it does not. */
  const agreed = (key: keyof CellStyle): ColorValue | undefined => {
    const first = draft.cells[selected[0] ?? -1]?.[key]
    return selected.every((index) => draft.cells[index]?.[key] === first) ? first : undefined
  }

  const reshape = (axis: 'column' | 'row', delta: 1 | -1): void => {
    setDraft((current) => resizeGrid(current, axis, delta))
  }

  /*
   * The shape buttons do not TAKE focus, so the caret stays in the cell you
   * were typing in while you add a column beside it.
   *
   * Comfort, not correctness — and worth saying, because it was written as
   * the fix for the editor closing on every press and it was not. That was
   * the canvas reading the press as a gesture, and it is fixed where gestures
   * are decided; removing these four handlers leaves every test green.
   */
  const keepFocus = (event: { preventDefault: () => void }): void => {
    event.preventDefault()
  }

  const width = draft.columns.length

  return (
    <div
      className="of-table-edit of-editor-chrome"
      data-testid="table-editor"
      onBlur={(event) => {
        /*
         * Committed only when focus leaves the whole editor, not when it moves
         * between cells or onto one of the buttons. Tabbing from one cell to
         * the next is still one edit.
         */
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        ) {
          return
        }
        commit()
      }}
    >
      <div
        className="of-table of-table--editing"
        style={{
          gridTemplateColumns: tracks(draft.columns),
          gridTemplateRows: tracks(draft.rows),
          fontFamily: fontFamily(object.style.font),
          color: inkColor(object.style.textColor),
        }}
      >
        {draft.cells.map((cell, index) => (
          <textarea
            key={index}
            className={`of-table__cell of-table__input${
              draft.headerRow && Math.floor(index / width) === 0 ? ' of-table__cell--head' : ''
            }`}
            value={plainTextOf(cell.text)}
            autoFocus={index === started}
            aria-label={`Row ${String(Math.floor(index / width) + 1)}, column ${String(
              (index % width) + 1,
            )}`}
            data-testid={`table-cell-${String(index)}`}
            data-selected={inRange.has(index) ? 'true' : undefined}
            style={cellPaint(cell)}
            onPointerDown={(event) => {
              /*
               * Shift EXTENDS from the anchor; a plain press starts a new
               * range where it landed. `preventDefault` only on the extend:
               * without it the browser moves focus and selects text across
               * two fields, and with it on every press you could not put the
               * caret anywhere.
               */
              if (event.shiftKey) {
                event.preventDefault()
                setFocus(index)
                return
              }
              setAnchor(index)
              setFocus(index)
            }}
            onChange={(event) => {
              const text = event.target.value
              setDraft((current) => ({
                ...current,
                /*
                 * Only the edited cell is rebuilt. Cells hold plain text
                 * today so nothing is lost either way — but the moment one
                 * holds a formatted span, rebuilding every cell on every
                 * keystroke would flatten the table because somebody
                 * corrected a typo in one corner.
                 */
                cells: current.cells.map((old, other) =>
                  other === index ? { text: [{ text }] } : old,
                ),
              }))
            }}
            onKeyDown={(event) => {
              // The board's own shortcuts must not fire while typing in a cell.
              event.stopPropagation()
              if (event.key === 'Escape') {
                onCancel()
                return
              }
              /*
               * Enter commits; Shift+Enter is a line inside the cell. A table
               * holds short values, so finishing is the common case and the
               * plain key is what makes it quick.
               */
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                commit()
              }
            }}
          />
        ))}
      </div>

      {/*
        * CELL COLOURS, acting on the selected range.
        *
        * Here rather than in the record panel, and that is deliberate. The
        * panel's controls come from the registry's `styleProps` and apply to
        * whole OBJECTS; a cell is not an object and has no entry there. Giving
        * the panel a notion of "the selected cells of the selected table"
        * would be type-specific knowledge in the one component that exists to
        * have none — rule 21. The table's own editor is where a table's parts
        * are edited, next to the column and row controls already there.
        */}
      <div className="of-table-edit__cells" data-testid="table-cell-style">
        <span className="of-table-edit__count">
          {selected.length === 1
            ? '1 cell'
            : `${String(selected.length)} cells`}
        </span>
        <Swatches
          kind="surface"
          label="Cell background"
          testPrefix="cell-fill"
          current={agreed('fill')}
          against={null}
          onPick={(fill) => {
            dress({ fill })
          }}
        />
        <Swatches
          kind="ink"
          label="Cell text colour"
          testPrefix="cell-ink"
          current={agreed('textColor')}
          // Against what the cell actually stands on: its own fill when it has
          // one, the board otherwise. The table's `color` is not it — a table
          // has no surface of its own.
          against={groundOf(agreed('fill'))}
          onPick={(textColor) => {
            dress({ textColor })
          }}
        />
        <Swatches
          kind="ink"
          label="Cell rule colour"
          testPrefix="cell-rule"
          current={agreed('border')}
          against={groundOf(agreed('fill'))}
          onPick={(border) => {
            dress({ border })
          }}
        />
        <button
          type="button"
          className="of-button of-button--ghost"
          data-testid="cell-clear"
          onMouseDown={keepFocus}
          onClick={() => {
            /*
             * Back to the table's own colours, which no token can express:
             * every colour in the palette is A colour, and "whatever the
             * table is" is the absence of one.
             */
            dress({ fill: null, textColor: null, border: null })
          }}
        >
          Clear
        </button>
      </div>

      {/*
        * The shape controls, beside the axis each one changes: columns on the
        * right, rows underneath. A row of four identical buttons in a corner
        * would make you read every label to find the one you want.
        */}
      <div className="of-table-edit__columns" role="group" aria-label="Columns">
        <button
          type="button"
          className="of-table-edit__step"
          aria-label="Add a column"
          data-testid="table-add-column"
          onMouseDown={keepFocus}
          onClick={() => {
            reshape('column', 1)
          }}
        >
          +
        </button>
        <button
          type="button"
          className="of-table-edit__step"
          aria-label="Remove the last column"
          disabled={width <= 1}
          data-testid="table-remove-column"
          onMouseDown={keepFocus}
          onClick={() => {
            reshape('column', -1)
          }}
        >
          −
        </button>
      </div>

      <div className="of-table-edit__rows" role="group" aria-label="Rows">
        <button
          type="button"
          className="of-table-edit__step"
          aria-label="Add a row"
          data-testid="table-add-row"
          onMouseDown={keepFocus}
          onClick={() => {
            reshape('row', 1)
          }}
        >
          +
        </button>
        <button
          type="button"
          className="of-table-edit__step"
          aria-label="Remove the last row"
          disabled={draft.rows.length <= 1}
          data-testid="table-remove-row"
          onMouseDown={keepFocus}
          onClick={() => {
            reshape('row', -1)
          }}
        >
          −
        </button>
      </div>
    </div>
  )
}

export const tableView = defineObjectView<TableData>({
  type: 'table',
  Renderer: TableRenderer,
  InlineEditor: TableEditor,
})
