import { type ReactNode } from 'react'
import { lineLookup, type ObjectStyle, type TableData } from '@openframe/core'
import { dashArray } from '../../scene/style-tokens.js'
import { edgesOf } from './geometry.js'
import { resolveLine } from './paint.js'

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
export function GridLines({
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
      data-testid="table-lines"
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
    >
      {drawn}
    </svg>
  )
}
