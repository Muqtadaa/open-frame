import { useEffect, useState } from 'react'

import type { Size } from '../scene/anchoring.js'

/**
 * The window a floating surface has to stay inside.
 *
 * The board already tracks this as `canvasSize`, but that is measured by the
 * canvas and only exists once a board is open — and apparatus on the front
 * door has to be clamped to something too. This is the one measurement both
 * screens can take.
 *
 * `documentElement.clientWidth` rather than `innerWidth`, because the latter
 * counts the scrollbar: a surface clamped to it can be placed under a gutter
 * it cannot be scrolled out from under.
 */
export function useViewportSize(): Size {
  const [size, setSize] = useState<Size>(() => measure())

  useEffect(() => {
    const onResize = (): void => {
      setSize((old) => {
        const next = measure()
        // A fresh object every resize event would re-place every surface on
        // the screen for a window that ended the same width it started.
        return old.width === next.width && old.height === next.height ? old : next
      })
    }
    window.addEventListener('resize', onResize)
    // A phone rotating fires this rather than resize on some browsers.
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  return size
}

function measure(): Size {
  // Server-side and in a test environment without a DOM, a sane box rather
  // than a crash: nothing is placed until something is measured anyway.
  if (typeof window === 'undefined') return { width: 1024, height: 768 }
  const root = window.document.documentElement
  return { width: root.clientWidth, height: root.clientHeight }
}
