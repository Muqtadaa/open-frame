import { type CSSProperties } from 'react'
import {
  type DashToken,
  type ObjectStyle,
  type StrokeToken,
  type TableCell,
  type TableLine,
} from '@openframe/core'
import {
  STROKE_WIDTHS,
  inkOf,
  lineOf,
  readableInkOn,
  surfaceOf,
  textAlign,
  verticalAlign,
} from '../../scene/style-tokens.js'

/*
 * How a cell and a line are dressed, from what the table and the cell say.
 */

/**
 * One cell's own dress — colours and alignment — as a style object, or
 * `undefined` for none.
 *
 * `undefined` rather than an empty object: React treats `style={{}}` as a
 * value that changed on every render, and this runs once per cell per frame on
 * a grid that may hold hundreds.
 *
 * Alignment set here beats the table's because the table's is INHERITED: its
 * `text-align` and its `--of-valign` come down from the grid, and a cell that
 * states its own simply shadows them.
 */
export function cellPaint(cell: TableCell): CSSProperties | undefined {
  if (
    cell.fill === undefined &&
    cell.textColor === undefined &&
    cell.align === undefined &&
    cell.verticalAlign === undefined
  ) {
    return undefined
  }
  /*
   * The ink flips on the CELL's own fill, not the table's. A black cell in a
   * plain table is the case: the table says nothing about ink, so without this
   * the cell takes the board's and disappears into itself.
   */
  const ink = cell.textColor === undefined ? readableInkOn(cell.fill) : inkOf(cell.textColor)
  return {
    ...(cell.fill === undefined ? {} : { background: surfaceOf(cell.fill, 'gray') }),
    ...(ink === undefined ? {} : { color: ink }),
    ...(cell.align === undefined ? {} : { textAlign: textAlign(cell.align) }),
    ...(cell.verticalAlign === undefined
      ? {}
      : { ['--of-valign' as string]: verticalAlign(cell.verticalAlign) }),
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
export function resolveLine(
  stored: TableLine | undefined,
  style: ObjectStyle,
  outer: boolean,
): { width: number; color: string; dash: DashToken | undefined } | null {
  const weight: StrokeToken = stored?.weight ?? style.stroke ?? 'thin'
  if (weight === 'none') return null
  const color =
    stored?.color !== undefined
      ? lineOf(stored.color)
      : style.strokeColor !== undefined
        ? lineOf(style.strokeColor)
        : outer
          ? 'var(--of-control-border)'
          : 'var(--of-edge-inner)'
  return { width: STROKE_WIDTHS[weight], color, dash: stored?.dash }
}
