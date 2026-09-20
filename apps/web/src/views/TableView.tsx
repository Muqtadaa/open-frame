import { useState } from 'react'

import { plainTextOf, type TableCell, type TableData } from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { RichTextView } from './RichTextView.js'
import { cellAt, tracks } from '../scene/table-grid.js'
import { fontFamily, textAlign } from '../scene/style-tokens.js'

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
 * Editing the whole grid at once, committing ONE command.
 *
 * Not one command per cell: filling a row would otherwise be five undo
 * entries, five saves and five network messages for what the user experienced
 * as one act. It is the same reasoning rule 4 applies to a drag.
 *
 * The caret starts in the cell that was double-clicked. `at` is how it knows;
 * without it the caret lands in the first cell however carefully you aimed,
 * which is the kind of thing that reads as broken rather than as missing.
 */
function TableEditor({ object, at, onCommit, onCancel }: ObjectEditorProps<TableData>) {
  const { columns, rows, cells, headerRow } = object.data
  const [texts, setTexts] = useState<readonly string[]>(() =>
    cells.map((cell) => plainTextOf(cell.text)),
  )

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
    return found === null ? 0 : found.row * columns.length + found.column
  })

  const commit = (next: readonly string[]): void => {
    /*
     * An UNCHANGED cell keeps its original value rather than being rebuilt
     * from plain text. Cells only ever hold plain text today, so nothing is
     * lost either way — but the moment one holds a formatted span, rebuilding
     * every cell on every edit would flatten the whole table because somebody
     * corrected a typo in one corner.
     */
    const written: TableCell[] = cells.map((cell, index) => {
      const text = next[index] ?? ''
      return plainTextOf(cell.text) === text ? cell : { text: [{ text }] }
    })
    onCommit({ cells: written })
  }

  return (
    <div
      className="of-table of-table--editing"
      style={{
        gridTemplateColumns: tracks(columns),
        gridTemplateRows: tracks(rows),
        fontFamily: fontFamily(object.style.font),
      }}
      data-testid="table-editor"
    >
      {texts.map((text, index) => (
        <textarea
          key={index}
          className={`of-table__cell of-table__input${
            headerRow && Math.floor(index / columns.length) === 0 ? ' of-table__cell--head' : ''
          }`}
          value={text}
          autoFocus={index === started}
          aria-label={`Row ${String(Math.floor(index / columns.length) + 1)}, column ${String(
            (index % columns.length) + 1,
          )}`}
          data-testid={`table-cell-${String(index)}`}
          onChange={(event) => {
            setTexts((current) =>
              current.map((value, at2) => (at2 === index ? event.target.value : value)),
            )
          }}
          onKeyDown={(event) => {
            // The board's own shortcuts must not fire while typing into a cell.
            event.stopPropagation()
            if (event.key === 'Escape') {
              onCancel()
              return
            }
            /*
             * Enter commits; Shift+Enter is a line inside the cell. A table is
             * a grid of short values, so the common case is finishing, and
             * making the common case the plain key is what makes it quick.
             */
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              commit(texts)
            }
          }}
          onBlur={(event) => {
            /*
             * Committed only when focus leaves the TABLE, not when it moves
             * between cells. Tabbing from one cell to the next is still one
             * edit, and committing per cell would put the whole point of a
             * single command back where it started.
             */
            if (event.relatedTarget instanceof Node && event.currentTarget.parentElement?.contains(event.relatedTarget) === true) {
              return
            }
            commit(texts)
          }}
        />
      ))}
    </div>
  )
}

export const tableView = defineObjectView<TableData>({
  type: 'table',
  Renderer: TableRenderer,
  InlineEditor: TableEditor,
})
