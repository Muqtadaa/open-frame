/**
 * v1 → v2: a cell's `border` colour becomes lines on the grid (ADR 0015).
 *
 * Declares its own local shapes and operates on `unknown`, per rule 6 — it
 * must keep meaning what it means today whatever `TableData` becomes. Pure,
 * forward-only, never edited once shipped.
 *
 * A v1 cell drew its border on its RIGHT and BOTTOM sides only, so that is
 * exactly what it becomes: the vertical line after its column and the
 * horizontal line under its row, in that colour. Nothing that was drawn moves;
 * the lines simply stop belonging to one of the two cells beside them.
 */

interface V1Cell {
  readonly border?: unknown
  readonly [key: string]: unknown
}

interface V1Data {
  readonly columns?: unknown
  readonly cells?: unknown
  readonly [key: string]: unknown
}

interface V2LineAt {
  readonly row: number
  readonly col: number
  readonly line: { readonly color: string }
}

export function borderToLines(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data
  const v1 = data as V1Data
  // Anything malformed is left for validation to refuse and the board to
  // quarantine (rule 7) — guessing at a shape would be a write nobody made.
  if (!Array.isArray(v1.columns) || !Array.isArray(v1.cells)) return data
  const width = v1.columns.length
  if (width === 0) return data

  const h: V2LineAt[] = []
  const v: V2LineAt[] = []
  const cells = (v1.cells as unknown[]).map((cell, index) => {
    if (typeof cell !== 'object' || cell === null) return cell
    const { border, ...rest } = cell as V1Cell
    if (typeof border !== 'string') return border === undefined ? cell : rest
    const row = Math.floor(index / width)
    const col = index % width
    v.push({ row, col: col + 1, line: { color: border } })
    h.push({ row: row + 1, col, line: { color: border } })
    return rest
  })

  return h.length === 0 ? { ...v1, cells } : { ...v1, cells, lines: { h, v } }
}
