/**
 * A range copied out of a spreadsheet, read from the plain text every
 * spreadsheet puts on the clipboard: tab between cells, newline between rows,
 * and a cell holding either one wrapped in double quotes (with `""` for a
 * quote inside it) — what Sheets, Excel and Numbers all write.
 *
 * Words from a document can hold a tab too — code indented with them, most
 * often — so text is only a grid when it is SHAPED like one: every row the
 * same number of cells, and more than one. `fromTable` says the same copy
 * also carried an HTML table, which settles it, and a ragged range is then
 * padded rather than refused.
 *
 * `null` when the text is not a grid, so it is pasted as words instead.
 */
export function gridFromText(
  text: string,
  options: { readonly fromTable?: boolean } = {},
): string[][] | null {
  if (!text.includes('\t')) return null
  const rows = readRows(text.replace(/\r\n?/g, '\n'))
  // The newline a spreadsheet ends its last row with is not an empty row.
  if (rows.length > 1 && rows.at(-1)?.every((cell) => cell === '') === true) rows.pop()
  const widths = new Set(rows.map((row) => row.length))
  const widest = Math.max(...widths)
  if (widest < 2) return null
  if (widths.size > 1 && options.fromTable !== true) return null
  return rows
}

function readRows(text: string): string[][] {
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
      if (end < text.length && (next === undefined || next === '\t' || next === '\n')) {
        cell = quoted
        at = end + 1
        continue
      }
    }
    if (char === undefined || char === '\t' || char === '\n') {
      row.push(cell)
      cell = ''
      if (char !== '\t') {
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
