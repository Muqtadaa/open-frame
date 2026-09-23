import { useEffect, useState } from 'react'

import { DEFAULT_INK, type CursorInk } from '../interaction/tool-cursor.js'

/**
 * The colours a tool cursor is drawn in, taken from the world it is drawn on.
 *
 * READ FROM THE TOKENS rather than kept as a second copy of them. A cursor is
 * an image, so it cannot inherit a custom property the way everything else in
 * this product does — which makes it exactly the kind of thing that keeps a
 * stale palette alive long after the stylesheet moved on. Asking
 * `getComputedStyle` for `--of-ink` and `--of-panel` means the pointer is
 * literally the ink of whichever theme is applied.
 *
 * The two themes are not light and dark variants of one palette — they are
 * two worlds that share token names — which is the whole reason this works
 * without knowing anything about either.
 *
 * Re-read when the theme changes, which is an attribute on the root element.
 * Observed rather than plumbed through: the control that changes it is in the
 * status bar, the thing that cares is the canvas, and a prop between them
 * would be a wire through everything in between for one string.
 */
export function useCursorInk(): CursorInk {
  const [colours, setColours] = useState<CursorInk>(() => read())

  useEffect(() => {
    if (typeof window === 'undefined') return
    const root = window.document.documentElement

    const refresh = (): void => {
      setColours((old) => {
        const next = read()
        // A fresh object every mutation would rebuild every cursor, and the
        // theme attribute is touched for reasons other than a change.
        return old.ink === next.ink && old.halo === next.halo ? old : next
      })
    }

    // The stylesheet may not have applied on the first paint.
    refresh()

    const watching = new MutationObserver(refresh)
    watching.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      watching.disconnect()
    }
  }, [])

  return colours
}

function read(): CursorInk {
  if (typeof window === 'undefined') return DEFAULT_INK
  const style = window.getComputedStyle(window.document.documentElement)
  const ink = style.getPropertyValue('--of-ink').trim()
  const halo = style.getPropertyValue('--of-panel').trim()
  // An unresolved token is an empty string, not an error. Better the default
  // pair than a cursor drawn in nothing at all.
  return ink === '' || halo === '' ? DEFAULT_INK : { ink, halo }
}
