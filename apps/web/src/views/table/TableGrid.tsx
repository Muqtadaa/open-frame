import { type HTMLAttributes, type ReactNode } from 'react'
import { plainTextOf, type ObjectStyle, type TableCell, type TableData } from '@openframe/core'
import { RichTextView } from '../RichTextView.js'
import { tracks } from '../../scene/table-grid.js'
import {
  fontFamily,
  inkColor,
  readableInkOn,
  surfaceOf,
  textAlign,
  verticalAlign,
} from '../../scene/style-tokens.js'
import { lineClamp } from '../line-clamp.js'
import { GridLines } from './GridLines.js'
import { letter } from './cells.js'
import { mergeIndex } from './geometry.js'
import { cellPaint } from './paint.js'

/**
 * The grid itself: the cells laid out, and the lines over them.
 *
 * Shared by the board and the editor, so what you edit is what is drawn — the
 * editor only swaps one cell's contents for a field.
 */
export function TableGrid({
  data,
  style,
  width,
  height,
  label,
  content,
  cellProps,
  sized = false,
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
  /**
   * Drawn at `width` by `height` rather than filling the object: the editor's
   * draft can be a different size from the object until the edit commits.
   */
  readonly sized?: boolean | undefined
}) {
  const { columns, rows, cells, headerRow } = data
  const width_ = columns.length
  const merges = mergeIndex(data)
  // Placed explicitly only when something spans; otherwise the grid flows.
  const placed = merges.anchors.size > 0

  return (
    <div
      className="of-table-wrap"
      style={sized ? { width: `${String(width)}px`, height: `${String(height)}px` } : undefined}
    >
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
        {/*
         * Each row its own element, laid out as if it were not there
         * (`display: contents`), so the cells still sit on the table's grid.
         * A cell outside a row has no table to belong to: assistive
         * technology could not read the grid as one.
         */}
        {rows.map((_, row) => (
          <div key={row} role="row" className="of-table__row">
            {cells.slice(row * width_, (row + 1) * width_).map((cell, col) => {
              const index = row * width_ + col
              if (merges.covered.has(index)) return null
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
                  /*
                   * A header nobody has typed yet still names its column, in
                   * the words the editor's header strip uses: a fresh table
                   * read as a grid of columns called nothing (audit
                   * 2026-09-27).
                   */
                  aria-label={
                    head && plainTextOf(cell.text).trim() === ''
                      ? `Column ${letter(col)}`
                      : undefined
                  }
                  // Where it is and how far it reaches, read back by fitting a
                  // track: with merges, a cell's position among its siblings no
                  // longer says which column it is in.
                  data-row={row}
                  data-col={col}
                  data-rows={merge?.rows ?? 1}
                  data-cols={merge?.cols ?? 1}
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
                    <div
                      className="of-table__cell-text"
                      data-testid="table-cell-text"
                      ref={lineClamp}
                    >
                      <RichTextView value={cell.text} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <GridLines data={data} style={style} width={width} height={height} />
    </div>
  )
}

export const describeShape = (data: TableData): string =>
  `Table, ${String(data.columns.length)} columns by ${String(data.rows.length)} rows`
