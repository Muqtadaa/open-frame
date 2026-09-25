/**
 * How far in from the top and bottom of the window the board's furniture
 * reaches.
 *
 * The zoom control and the navigation bar are anchored to the WINDOW rather than to
 * anything on the board, so they cannot move out of the way of a surface that
 * lands on them — and between them they run nearly the full width of the bottom
 * edge. The options panel on a selection low on the board was clamped to the
 * bottom of the window and covered the zoom readout.
 *
 * A BAND rather than a list of rectangles to dodge. A full-width strip collides
 * with every side a panel would naturally take, so treating it as an obstacle
 * threw the panel clear across the selection — onto the context menu, on the
 * right-click that opened it. A band leaves the panel where it belongs and
 * lifts it clear.
 *
 * Marked in the DOM rather than listed here, for the reason rule 15 gives: how
 * much room a piece of furniture takes is whatever the browser made of its
 * contents. The status bar is 780 pixels wide with a board title in it and
 * nothing in the source says so.
 *
 * The attribute names the edge, because the next piece of furniture may not be
 * at the bottom and `data-keep-clear` alone would say it was. The tool rail is
 * deliberately not marked: `keepClearLeft` is already its band, and two answers
 * for one piece of chrome is one too many.
 */
export interface Bands {
  /** How far down from the top of the window the furniture there reaches. */
  readonly top: number
  /** How far up from the bottom. */
  readonly bottom: number
}

const NONE: Bands = { top: 0, bottom: 0 }

export function furnitureBands(): Bands {
  if (typeof window === 'undefined') return NONE
  let top = 0
  let bottom = 0
  for (const element of window.document.querySelectorAll<HTMLElement>('[data-keep-clear]')) {
    const box = element.getBoundingClientRect()
    // An element with nothing in it measures zero AT its edge of the window,
    // which would reserve the gutter for furniture that is not showing.
    if (box.width === 0 || box.height === 0) continue
    if (element.dataset.keepClear === 'bottom') bottom = Math.max(bottom, window.innerHeight - box.top)
    if (element.dataset.keepClear === 'top') top = Math.max(top, box.bottom)
  }
  return { top, bottom }
}

/**
 * Watch the bands, and say so when they change.
 *
 * A SUBSCRIPTION rather than a measurement per render, because furniture moves
 * when the window is resized and at no other time — while a surface anchored to
 * a selection re-renders on every frame of a drag, and reading layout there
 * makes the browser flush one sixty times a second for an answer that has not
 * changed since the last.
 *
 * Observed as well as listened for: the navigation bar grows when a board is
 * given a longer title, which no window event reports.
 */
export function watchFurnitureBands(changed: (bands: Bands) => void): () => void {
  if (typeof window === 'undefined') return () => undefined

  let last = furnitureBands()
  const tell = (): void => {
    const next = furnitureBands()
    if (next.top === last.top && next.bottom === last.bottom) return
    last = next
    changed(next)
  }

  // Once at the start, in case a surface mounted before the furniture did.
  changed(last)
  window.addEventListener('resize', tell)

  // jsdom has no ResizeObserver, and a test that renders a surface must not
  // fall over for want of one: the window listener alone is enough there.
  const observer =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          tell()
        })
  if (observer !== null) {
    for (const element of window.document.querySelectorAll('[data-keep-clear]')) {
      observer.observe(element)
    }
  }

  return () => {
    window.removeEventListener('resize', tell)
    observer?.disconnect()
  }
}
