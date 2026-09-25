import { useEffect, useRef, useState } from 'react'

import type { TableSize } from '../interaction/interaction-store.js'

/**
 * Choosing a table's size by pointing at it.
 *
 * The grid IS the control: you see the shape you are about to get rather than
 * reading two numbers and imagining it. Hovering previews, clicking chooses,
 * and the size is then dropped where you click on the board.
 *
 * Its limits are the picker's, not the type's. A table may hold far more than
 * this — the schema allows 26 columns and 200 rows — but a chooser big enough
 * for the maximum is one nobody can aim at. Past this, add rows from the table
 * itself.
 */
const MOST_COLUMNS = 8
const MOST_ROWS = 8

interface Props {
  readonly size: TableSize
  readonly onChoose: (size: TableSize) => void
}

export function TableSizePicker({ size, onChoose }: Props) {
  /*
   * What the pointer is over, or null when it is not over the grid at all.
   * The CHOSEN size is what shows then, so the control always says what
   * clicking the tool would give you.
   */
  const [hovered, setHovered] = useState<TableSize | null>(null)
  const shown = hovered ?? size
  const grid = useRef<HTMLDivElement>(null)

  /*
   * One Tab stop, on the size it would give you, and focus lands there when
   * the picker opens. Sixty-four stops made the grid a wall to Tab through,
   * and focus left on the rail made it unreachable: the picker is portaled
   * into the chrome layer, which comes BEFORE the rail in the document.
   */
  useEffect(() => {
    grid.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus()
  }, [])

  const move = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const [columns, rows] =
      event.key === 'ArrowRight'
        ? [shown.columns + 1, shown.rows]
        : event.key === 'ArrowLeft'
          ? [shown.columns - 1, shown.rows]
          : event.key === 'ArrowDown'
            ? [shown.columns, shown.rows + 1]
            : event.key === 'ArrowUp'
              ? [shown.columns, shown.rows - 1]
              : [null, null]
    if (columns === null || rows === null) return
    // The arrows are the grid's; on the board they would nudge the selection.
    event.preventDefault()
    event.stopPropagation()
    const column = Math.min(MOST_COLUMNS, Math.max(1, columns))
    const row = Math.min(MOST_ROWS, Math.max(1, rows))
    grid.current
      ?.querySelector<HTMLElement>(`[data-testid="table-size-${String(column)}x${String(row)}"]`)
      ?.focus()
  }

  return (
    <div className="of-grid-pick" data-testid="table-size-picker">
      <div
        ref={grid}
        className="of-grid-pick__grid"
        role="grid"
        aria-label="Table size"
        onKeyDown={move}
        onPointerLeave={() => {
          setHovered(null)
        }}
      >
        {Array.from({ length: MOST_ROWS }, (_, row) => (
          <div className="of-grid-pick__row" role="row" key={row}>
            {Array.from({ length: MOST_COLUMNS }, (_, column) => {
              const within = column < shown.columns && row < shown.rows
              const corner = column + 1 === shown.columns && row + 1 === shown.rows
              return (
                <button
                  key={column}
                  type="button"
                  role="gridcell"
                  className={`of-grid-pick__cell${within ? ' of-grid-pick__cell--on' : ''}`}
                  aria-selected={within}
                  tabIndex={corner ? 0 : -1}
                  aria-label={`${String(column + 1)} by ${String(row + 1)}`}
                  data-testid={`table-size-${String(column + 1)}x${String(row + 1)}`}
                  onPointerEnter={() => {
                    setHovered({ columns: column + 1, rows: row + 1 })
                  }}
                  onFocus={() => {
                    // Keyboard users get the same preview as the pointer, or
                    // the readout below would be wrong for half the people
                    // using it.
                    setHovered({ columns: column + 1, rows: row + 1 })
                  }}
                  onClick={() => {
                    onChoose({ columns: column + 1, rows: row + 1 })
                  }}
                />
              )
            })}
          </div>
        ))}
      </div>

      <p className="of-grid-pick__readout" data-testid="table-size-readout">
        {count(shown.columns, 'column')} × {count(shown.rows, 'row')}
      </p>
    </div>
  )
}

function count(n: number, noun: string): string {
  return `${String(n)} ${noun}${n === 1 ? '' : 's'}`
}
