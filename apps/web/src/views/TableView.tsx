import { useState } from 'react'

import { plainTextOf, resizeGrid, type TableData } from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { RichTextView } from './RichTextView.js'
import { cellAt, tracks } from '../scene/table-grid.js'
import { fontFamily, textAlign, inkColor } from '../scene/style-tokens.js'

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

  const commit = (): void => {
    onCommit({ columns: draft.columns, rows: draft.rows, cells: draft.cells })
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
