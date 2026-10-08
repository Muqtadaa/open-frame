/**
 * A range copied out of a spreadsheet, read from the plain text every
 * spreadsheet puts on the clipboard: tab between cells, newline between rows,
 * and a cell holding either one wrapped in double quotes (with `""` for a
 * quote inside it) — what Sheets, Excel and Numbers all write.
 *
 * Words from a document can hold a tab too — code indented with them, most
 * often — so text is only a grid when it is SHAPED like one: every row the
 * same number of cells, and more than one. `fromTable` says the same copy
 * also carried an HTML table, which settles it: a single column, which has no
 * tab, is a grid then, and a ragged range is padded rather than refused. One
 * cell alone is never a grid; it is a word (Codex, on #76).
 *
 * Text with no tab can still be a grid of commas — see `csvFromText`.
 *
 * `null` when the text is not a grid, so it is pasted as words instead.
 */
export function gridFromText(
  text: string,
  options: { readonly fromTable?: boolean } = {},
): string[][] | null {
  const fromTable = options.fromTable === true
  const normal = text.replace(/\r\n?/g, '\n')
  // A single column has no tab to show for itself, but its table does.
  if (!normal.includes('\t') && !fromTable) return csvFromText(normal)
  const rows = withoutTrailingRow(readRows(normal, '\t'))
  const widths = new Set(rows.map((row) => row.length))
  const widest = Math.max(...widths)
  if (fromTable) {
    // One cell is a word, not a table.
    return rows.length > 1 || widest > 1 ? rows : null
  }
  if (widest < 2 || widths.size > 1) return null
  return rows
}

/**
 * Comma-separated text, when it is plainly a table: more than one row, every
 * row the same width and wider than one, and no cell set off by the space a
 * sentence puts after its commas. A file writes `a,b`; a person writes
 * `a, b` — and two lines of prose that happen to have one comma each are not
 * a table somebody meant to paste. Anything less certain stays words, and
 * Paste special › As a table reads it as a table on request (`gridFrom`).
 */
function csvFromText(text: string): string[][] | null {
  if (!text.includes(',')) return null
  // Read from the raw text, not the cells: a quoted cell may begin with a
  // space on purpose, and no comma was followed by one (Codex, on #98).
  const read = { spaced: false }
  const rows = withoutTrailingRow(readRows(text, ',', read))
  if (rows.length < 2 || read.spaced) return null
  const widths = new Set(rows.map((row) => row.length))
  if (widths.size > 1 || (rows[0]?.length ?? 0) < 2) return null
  return rows
}

/**
 * Text read as a grid because somebody ASKED for a table (Paste special › As
 * a table): tabs if there are any, otherwise commas, otherwise one column.
 * Ragged rows are padded and cells trimmed, since nothing here has to decide
 * whether the text was a table. `null` when it holds no words at all.
 */
export function gridFrom(text: string): string[][] | null {
  const normal = text.replace(/\r\n?/g, '\n')
  const separator = normal.includes('\t') ? '\t' : ','
  const rows = withoutTrailingRow(readRows(normal, separator)).map((row) =>
    row.map((cell) => cell.trim()),
  )
  if (rows.every((row) => row.every((cell) => cell === ''))) return null
  const widest = Math.max(...rows.map((row) => row.length))
  return rows.map((row) => [...row, ...Array<string>(widest - row.length).fill('')])
}

/**
 * Lines of text as the notes they would be, one each (Paste special › As
 * notes): blank lines left out, and the marker a list puts in front of an
 * item — `-`, `*`, `•`, `1.`, `1)` — taken off, since the note is the item.
 */
export function linesOf(text: string): string[] {
  return (
    text
      .replace(/\r\n?/g, '\n')
      .split('\n')
      // The marker comes off before the blank lines go, so an empty item —
      // "- " — goes with them rather than becoming a note saying "-".
      .map((line) =>
        line
          .trim()
          .replace(/^(?:[-*•–]|\d{1,3}[.)])(?:\s+|$)/, '')
          .trim(),
      )
      .filter((line) => line !== '')
  )
}

/** The newline a spreadsheet ends its last row with is not an empty row. */
function withoutTrailingRow(rows: string[][]): string[][] {
  if (rows.length > 1 && rows.at(-1)?.every((cell) => cell === '') === true) rows.pop()
  return rows
}

/**
 * `seen.spaced` is set when an unquoted cell begins with a space or tab
 * straight after a separator — the space a sentence puts after its commas.
 */
function readRows(
  text: string,
  separator: '\t' | ',',
  seen: { spaced: boolean } = { spaced: false },
): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let at = 0
  while (at <= text.length) {
    const char = text[at]
    if (cell === '' && char === '"') {
      // A quoted cell runs to the quote that is not doubled.
      let end = at + 1
      let quoted = ''
      while (end < text.length) {
        if (text[end] === '"' && text[end + 1] === '"') {
          quoted += '"'
          end += 2
        } else if (text[end] === '"') {
          break
        } else {
          quoted += text[end]
          end += 1
        }
      }
      const next = text[end + 1]
      // Only a quote that closes at a cell's end was quoting; otherwise the
      // quote is just the first character of the cell.
      if (end < text.length && (next === undefined || next === separator || next === '\n')) {
        cell = quoted
        at = end + 1
        continue
      }
    }
    if (char === undefined || char === separator || char === '\n') {
      if (char === separator && /[ \t]/.test(text[at + 1] ?? '')) seen.spaced = true
      row.push(cell)
      cell = ''
      if (char !== separator) {
        rows.push(row)
        row = []
      }
      at += 1
      continue
    }
    cell += char
    at += 1
  }
  return rows
}
