import { useEffect, type RefObject } from 'react'

/**
 * Marks a scrolling box with which of its ends has more beyond it:
 * `data-more-before` when it is scrolled away from the start, and
 * `data-more-after` while there is still some to scroll to.
 *
 * Written straight onto the element rather than into state, because it
 * changes on every scroll event and nothing but the stylesheet reads it —
 * re-rendering the rail per scroll step to move a fade would be all cost.
 *
 * Why it exists at all: a phone draws no scrollbar, so a rail cut off by a
 * short window simply looked like a rail with fewer tools (audit 2026-09-27).
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current
    if (element === null) return
    const mark = (): void => {
      // A pixel of slack: a fractional scroll position never lands exactly.
      const before = element.scrollTop > 1
      const after = element.scrollTop + element.clientHeight < element.scrollHeight - 1
      element.toggleAttribute('data-more-before', before)
      element.toggleAttribute('data-more-after', after)
    }
    mark()
    element.addEventListener('scroll', mark, { passive: true })
    // The window changing height changes whether it scrolls at all.
    const resized = new ResizeObserver(mark)
    resized.observe(element)
    return () => {
      element.removeEventListener('scroll', mark)
      resized.disconnect()
    }
  }, [ref])
}
