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
 *
 * ## Everything here is in WORLD units, and that is not a coincidence
 *
 * The canvas is drawn by a single `scale(zoom)` on one wrapper, so every
 * element inside it is LAID OUT at world size and merely painted larger. The
 * ruler below is attached to `document.body`, outside that transform, so its
 * measurement is unscaled CSS pixels — world units. `scrollHeight` is a layout
 * property and is never scaled by a transform, so it is world units too.
 *
 * The first version of this converted the result by the zoom on the way out,
 * which halved every column fitted at 200% and quartered it at 400%. Nothing
 * caught it because the only test fitted a column at 100%, where dividing by
 * the zoom does nothing.
 */

/** A track fitted to nothing would be a track you cannot find again. */
const FLOOR = 24
/**
 * Past this, fitting stops serving the reader.
 *
 * A cell holding a paragraph would otherwise produce a column wider than the
 * board, and "fit the content" stops meaning anything useful — Excel caps this
 * too. The text still wraps inside the cap.
 */
const CEILING = 520

/**
 * The properties that decide how wide a run of text is.
 *
 * Copied as LONGHANDS rather than through the `font` shorthand, which
 * `getComputedStyle` is entitled to return as an empty string whenever the
 * value cannot be serialized into one. An empty `font` is not an error — it
 * silently leaves the ruler at the body's default face and size, so every
 * column fits to the width of text nobody is looking at.
 */
const FACE = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontVariant',
  'fontStretch',
  'letterSpacing',
  'wordSpacing',
  'textTransform',
] as const satisfies readonly (keyof CSSStyleDeclaration)[]

/**
 * The natural width of the widest cell in a column, in world units.
 *
 * Measured with a detached element rather than by reading the cells: they are
 * laid out at the width they currently have, so their own boxes only ever say
 * what they are, never what they want. Setting `white-space: pre` on a copy is
 * what asks the unwrapped question — and with `pre` a multi-line cell reports
 * its LONGEST line, which is the width it wants, rather than the sum.
 *
 * The cell's CONTENT is cloned, not its text, so a bold run or a span carrying
 * its own size is measured as what it is. Reading `textContent` measured a
 * heading at the body weight and fitted it a few pixels too narrow — the one
 * kind of wrong that looks right until you read the last letter.
 */
export function fitColumnWidth(cells: readonly HTMLElement[]): number | null {
  if (cells.length === 0) return null

  const ruler = window.document.createElement('div')
  ruler.style.position = 'absolute'
  ruler.style.visibility = 'hidden'
  ruler.style.left = '-9999px'
  ruler.style.top = '-9999px'
  ruler.style.whiteSpace = 'pre'
  ruler.style.width = 'max-content'
  window.document.body.append(ruler)

  let widest = 0
  try {
    for (const cell of cells) {
      const style = window.getComputedStyle(cell)
      for (const property of FACE) ruler.style[property] = style[property]

      ruler.replaceChildren(
        ...[...cell.childNodes].map((node) => node.cloneNode(true)),
      )
      /*
       * The cell's OWN padding and rules, not a number copied from the
       * stylesheet. A constant here is a second source of truth that goes
       * stale the first time the cell's padding changes, and the symptom is
       * text clipped by exactly the difference.
       */
      const around =
        Number.parseFloat(style.paddingLeft) +
        Number.parseFloat(style.paddingRight) +
        Number.parseFloat(style.borderLeftWidth) +
        Number.parseFloat(style.borderRightWidth)

      widest = Math.max(widest, ruler.getBoundingClientRect().width + around)
    }
  } finally {
    ruler.remove()
  }

  return Math.min(CEILING, Math.max(FLOOR, Math.ceil(widest)))
}

/**
 * The height the tallest cell in a row needs at its CURRENT width, in world
 * units.
 *
 * The opposite question to a column's, and it needs no ruler: the cells are
 * already laid out at the width they have, so how tall their content is is
 * something they can be asked directly. `scrollHeight` is that answer even
 * when the cell is clipping it — and it is a layout property, so it reports
 * world units whatever the canvas is scaled to.
 */
export function fitRowHeight(cells: readonly HTMLElement[]): number | null {
  if (cells.length === 0) return null

  let tallest = 0
  for (const cell of cells) {
    const style = window.getComputedStyle(cell)
    // `scrollHeight` covers the content and its padding but not the rules
    // around it, and a row fitted a rule short clips its last line.
    const around =
      Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth)
    tallest = Math.max(tallest, cell.scrollHeight + around)
  }

  return Math.min(CEILING, Math.max(FLOOR, Math.ceil(tallest)))
}

/**
 * The drawn cells of one column or row, found by what they SAY they are.
 *
 * Counting the grid's children stopped working with merges: a covered cell is
 * not drawn, so every cell after the first merge sat one place further along
 * than its index said, and fitting a column measured its neighbour. Each cell
 * carries its own address and span, and one that spans several tracks is left
 * out — its width is shared, so it says nothing about any one of them, which
 * is what a spreadsheet does with a merged cell when it fits a column.
 */
export function cellsInTrack(
  grid: Element,
  axis: 'row' | 'column',
  index: number,
): HTMLElement[] {
  return [...grid.children].filter((cell): cell is HTMLElement => {
    if (!(cell instanceof HTMLElement)) return false
    const at = axis === 'column' ? cell.dataset.col : cell.dataset.row
    const span = axis === 'column' ? cell.dataset.cols : cell.dataset.rows
    return at === String(index) && span === '1'
  })
}
