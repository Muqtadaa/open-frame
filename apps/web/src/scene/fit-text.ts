/**
 * How big an object has to be to hold the text inside it.
 *
 * The answer to overflow that does not hide anything: rather than marking what
 * is cut off and leaving it cut off, grow the object until nothing is. Reached
 * by double-clicking the handle for the axis you want fitted, which is the
 * same gesture a table's divider already answers to.
 *
 * ## World units, as everywhere else on the canvas
 *
 * The board is drawn by one `scale(zoom)` on a wrapper, so everything inside
 * is LAID OUT at world size and merely painted larger. Every measurement here
 * is a layout measurement, so it is already in world units and must not be
 * divided by the zoom — the mistake that made a fitted table column come out
 * half size at 200%.
 */

/** A track fitted to nothing would be a box you cannot find again. */
const FLOOR = 40
/**
 * Past this, fitting has stopped serving the reader.
 *
 * A note holding an essay would otherwise become a column taller than the
 * board. The text still clips inside the cap, with the ellipsis to say so.
 */
const CEILING = 2000

/** The properties that decide how a run of text lays out. */
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
  'lineHeight',
  'textIndent',
  'overflowWrap',
  'wordBreak',
] as const satisfies readonly (keyof CSSStyleDeclaration)[]

/**
 * One reading of how a text box's size follows its object's.
 *
 * Two of these determine the relationship, which is why they are taken rather
 * than assumed. A sticky note's padding is ABSOLUTE — thirteen pixels however
 * big the note is — while a shape's label is inset by a PERCENTAGE of the
 * shape, so it grows as the shape does. Subtracting a measured surround works
 * for the first and undershoots the second; multiplying by a measured ratio
 * does the reverse. Sampling twice and solving covers both, and covers the
 * next type without anybody having to notice which kind it is.
 */
export interface Sample {
  readonly frame: number
  readonly box: number
}

/**
 * The frame extent at which the text box would be `wanted` across.
 *
 * `box = a · frame + b`, solved from two samples. `null` when the box does not
 * follow the frame at all (`a` is zero), which would otherwise divide by it.
 */
export function solveExtent(low: Sample, high: Sample, wanted: number): number | null {
  const spread = high.frame - low.frame
  if (spread === 0) return null

  const a = (high.box - low.box) / spread
  // A box that does not grow with its object cannot be fitted by growing it.
  if (Math.abs(a) < 0.001) return null

  const b = low.box - a * low.frame
  const frame = (wanted - b) / a
  if (!Number.isFinite(frame)) return null

  return Math.min(CEILING, Math.max(FLOOR, Math.ceil(frame)))
}

/** The content box of an element: what is actually available to text. */
function contentExtent(element: HTMLElement, axis: 'x' | 'y'): number {
  const style = window.getComputedStyle(element)
  return axis === 'x'
    ? element.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight)
    : element.clientHeight -
        Number.parseFloat(style.paddingTop) -
        Number.parseFloat(style.paddingBottom)
}

/**
 * The size the text WANTS along one axis, in world units.
 *
 * Measured on a detached copy, because the live element is laid out at the
 * size it has and clamped to the lines that fit — it can only ever report what
 * it is, never what it wants. The clamp is cleared on the copy for exactly
 * that reason: measuring the clamped element would return the height it was
 * already given and fitting would be a no-op that looked like a bug.
 */
function wantedExtent(text: HTMLElement, axis: 'x' | 'y', width: number): number | null {
  const ruler = window.document.createElement('div')
  const style = window.getComputedStyle(text)
  ruler.style.position = 'absolute'
  ruler.style.visibility = 'hidden'
  ruler.style.left = '-9999px'
  ruler.style.top = '-9999px'
  for (const property of FACE) ruler.style[property] = style[property]

  if (axis === 'y') {
    // Same width, so it breaks in the same places: fitting the height must not
    // silently change where the lines end.
    ruler.style.width = `${String(width)}px`
    ruler.style.whiteSpace = style.whiteSpace
  } else {
    // Unwrapped, which is what fitting the width means — the widest line as it
    // would be if nothing forced it to break.
    ruler.style.width = 'max-content'
    ruler.style.whiteSpace = 'pre'
  }

  ruler.replaceChildren(...[...text.childNodes].map((node) => node.cloneNode(true)))
  // Descendants may carry the clamp themselves. `unset` rather than a value,
  // so a nested element that never had one is left alone.
  for (const descendant of ruler.querySelectorAll('*')) {
    if (descendant instanceof HTMLElement) {
      descendant.style.setProperty('-webkit-line-clamp', 'unset')
    }
  }

  window.document.body.append(ruler)
  try {
    const box = ruler.getBoundingClientRect()
    return axis === 'x' ? box.width : box.height
  } finally {
    ruler.remove()
  }
}

/**
 * The frame extent that would hold this object's text, or `null`.
 *
 * `null` for an object with no text element, for one whose box does not follow
 * its frame, and for one that already fits — a gesture that reports nothing to
 * do is better than one that dispatches a command changing nothing, because
 * the second costs an undo step for a press that did nothing visible.
 */
export function fitToText(
  objectElement: HTMLElement,
  axis: 'x' | 'y',
  frame: { readonly width: number; readonly height: number },
): number | null {
  const text = objectElement.querySelector('[data-fit-text]')
  if (!(text instanceof HTMLElement)) return null
  const box = text.parentElement
  if (box === null) return null

  const currentFrame = axis === 'x' ? frame.width : frame.height
  if (currentFrame <= 0) return null

  const wanted = wantedExtent(text, axis, contentExtent(box, 'x'))
  if (wanted === null) return null

  /*
   * The second sample, taken by briefly doubling the object and reading the
   * box again. Set and restored in the same synchronous block, so React never
   * sees it and the browser never paints it — the only cost is one forced
   * layout, on an explicit double-click rather than per frame.
   */
  const property = axis === 'x' ? 'width' : 'height'
  const before = objectElement.style[property]
  const low: Sample = { frame: currentFrame, box: contentExtent(box, axis) }
  objectElement.style[property] = `${String(currentFrame * 2)}px`
  const high: Sample = { frame: currentFrame * 2, box: contentExtent(box, axis) }
  objectElement.style[property] = before

  const fitted = solveExtent(low, high, Math.ceil(wanted))
  // Within a pixel of where it already is: nothing to do, and nothing to undo.
  return fitted === null || Math.abs(fitted - currentFrame) < 1 ? null : fitted
}
