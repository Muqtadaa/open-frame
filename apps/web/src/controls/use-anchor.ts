import { useEffect, useRef, useState, type RefObject } from 'react'

import type { Size } from '../scene/anchoring.js'
import { useViewportSize } from './use-viewport-size.js'

/**
 * The three things `AnchoredSurface` needs, measured the same way every time.
 *
 * Every floating surface wants the rectangle of the control it belongs to and
 * the window it has to stay inside, and every one of them was working that out
 * for itself — mostly in CSS, with `calc(100% + 10px)` and a direction chosen
 * once and never revisited. This is what makes going through the layer cheaper
 * than not, which is the only thing that keeps a rule like that true.
 *
 * MEASURED IN AN EFFECT, not during render. A ref holds no value React can
 * re-render on, so reading `current` while rendering gives a stale answer on
 * the pass that matters — the lint rule that forbids it is right, and the
 * first version of this got it wrong.
 *
 * Re-measured when the window changes, because the bar a trigger sits in moves
 * with it, and a rectangle captured at the moment of opening would leave its
 * surface behind.
 *
 * Here rather than in `hooks/` because `controls` is a LEAF and may not import
 * a hook — and the colour picker, which lives here, needs one. Beside the
 * surface it feeds is where it belongs anyway: they are one primitive, and
 * splitting them put half of it out of reach of the layer's own callers.
 */
export function useAnchoredTo<T extends HTMLElement>(
  open: boolean,
): {
  readonly ref: RefObject<T | null>
  readonly anchor: DOMRect | null
  readonly surface: Size
} {
  const ref = useRef<T>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const surface = useViewportSize()

  useEffect(() => {
    if (!open) return
    setAnchor(ref.current?.getBoundingClientRect() ?? null)
  }, [open, surface])

  return { ref, anchor, surface }
}
