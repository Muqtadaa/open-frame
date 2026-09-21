/**
 * How wide or tall a table's track has to be to hold what is in it.
 *
 * MEASURED, from the cells the browser has already laid out, because the answer
 * depends on the face, the size and where the text happens to break — none of
 * which the document knows. Core owns the arithmetic that follows; this owns
 * only the measurement, which is why it is here and not there.
 *
 * Double-clicking a boundary is how every spreadsheet asks this question, and
 * the answer has to match what is on screen rather than an estimate of it.
 */

/** Room for the cell's own padding, in screen pixels. Mirrors `.of-table__cell`. */
const CELL_PADDING_PX = 14
/** A track fitted to nothing would be a track you cannot find again. */
const FLOOR_PX = 24
/**
 * Past this, fitting stops serving the reader.
 *
 * A cell holding a paragraph would otherwise produce a column wider than the
 * board, and "fit the content" stops meaning anything useful — Excel caps this
 * too. The text still wraps inside the cap.
 */
const CEILING_PX = 520

/**
 * The natural width of the widest cell in a column, in SCREEN pixels.
 *
 * Measured with a detached element rather than by reading the cells: they are
 * laid out at the width they currently have, so their own boxes only ever say
 * what they are, never what they want. Setting `white-space: pre` on a copy is
 * what asks the unwrapped question.
 */
export function fitColumnWidth(cells: readonly HTMLElement[]): number | null {
  if (cells.length === 0) return null
  const first = cells[0]
  if (first === undefined) return null

  const ruler = window.document.createElement('span')
  const style = window.getComputedStyle(first)
  ruler.style.cssText = `position:absolute;visibility:hidden;white-space:pre;left:-9999px;top:-9999px;font:${style.font}`
  window.document.body.append(ruler)

  let widest = 0
  try {
    for (const cell of cells) {
      // Longest LINE, not the whole text: a cell holding two lines is as wide
      // as its longer one, and joining them would ask for the sum.
      for (const line of (cell.textContent ?? '').split('\n')) {
        ruler.textContent = line
        widest = Math.max(widest, ruler.getBoundingClientRect().width)
      }
    }
  } finally {
    ruler.remove()
  }

  return Math.min(CEILING_PX, Math.max(FLOOR_PX, widest + CELL_PADDING_PX))
}

/**
 * The height the tallest cell in a row needs at its CURRENT width.
 *
 * The opposite question to a column's, and it needs no ruler: the cells are
 * already laid out at the width they have, so how tall their content is is
 * something they can be asked directly. `scrollHeight` is that answer even
 * when the cell is clipping it.
 */
export function fitRowHeight(cells: readonly HTMLElement[]): number | null {
  if (cells.length === 0) return null
  const tallest = Math.max(...cells.map((cell) => cell.scrollHeight))
  return Math.min(CEILING_PX, Math.max(FLOOR_PX, tallest))
}
