/**
 * How far up from the bottom of the window the board's furniture reaches.
 *
 * The zoom control and the status bar are anchored to the WINDOW rather than to
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
export function bottomBand(): number {
  if (typeof window === 'undefined') return 0
  let band = 0
  for (const element of window.document.querySelectorAll<HTMLElement>(
    '[data-keep-clear="bottom"]',
  )) {
    const box = element.getBoundingClientRect()
    // An element with nothing in it measures zero AT the bottom of the window,
    // which would reserve the gutter for furniture that is not showing.
    if (box.width === 0 || box.height === 0) continue
    band = Math.max(band, window.innerHeight - box.top)
  }
  return band
}

/**
 * Watch the band, and say so when it changes.
 *
 * A SUBSCRIPTION rather than a measurement per render, because furniture moves
 * when the window is resized and at no other time — while a surface anchored to
 * a selection re-renders on every frame of a drag, and reading layout there
 * makes the browser flush one sixty times a second for an answer that has not
 * changed since the last.
 *
 * Observed as well as listened for: the status bar grows when a board is given
 * a longer title, which no window event reports.
 */
export function watchBottomBand(changed: (band: number) => void): () => void {
  if (typeof window === 'undefined') return () => undefined

  const tell = (): void => {
    changed(bottomBand())
  }

  // Once at the start, in case a surface mounted before the furniture did.
  tell()
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
    for (const element of window.document.querySelectorAll('[data-keep-clear="bottom"]')) {
      observer.observe(element)
    }
  }

  return () => {
    window.removeEventListener('resize', tell)
    observer?.disconnect()
  }
}
