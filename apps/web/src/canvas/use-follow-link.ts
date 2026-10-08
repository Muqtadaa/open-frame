import { safeLink } from '@openframe/core'
import { useEffect, type RefObject } from 'react'

/** A link inside an object's words, or null. */
function linkIn(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null
  const anchor = target.closest('a[href]')
  const inObject = anchor?.closest('[data-object-id]') ?? null
  return inObject === null ? null : anchor
}

/** Further than this between press and release, and it was a drag, not a click. */
const STILL = 4

/**
 * Links in the words on the board (ADR 0021).
 *
 * A plain click on a note SELECTS it, link or not — the board is somewhere
 * things are arranged, and a note that navigated away when somebody reached
 * for it would be a trap. So the browser never follows a link here by itself:
 * Mod+click follows it, and so does activation that came from no pointer at
 * all (`detail === 0`: Enter on a focused link, or a screen reader's own
 * "activate"), which is how assistive technology reaches a link.
 *
 * Followed in a new tab with no opener and no referrer, and only to an
 * address `safeLink` passes — the document was validated on the way in, but
 * the DOM is not the document, and this is the last step before a browser
 * acts on it.
 */
export function useFollowLink(containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const container = containerRef.current
    if (container === null) return
    /*
     * The anchor under the PRESS. The canvas captures the pointer when a
     * gesture starts, so the click that follows is dispatched to the canvas
     * and its target says nothing about what was under the finger.
     */
    let pressed: { x: number; y: number; anchor: Element | null } | null = null

    const onPointerDown = (event: PointerEvent): void => {
      pressed = { x: event.clientX, y: event.clientY, anchor: linkIn(event.target) }
    }

    const onClick = (event: MouseEvent): void => {
      const fromKeyboard = event.detail === 0
      const anchor = fromKeyboard ? linkIn(event.target) : (pressed?.anchor ?? null)
      const at = pressed
      pressed = null
      // The browser never follows one by itself: not on a plain click, which
      // selects, and not on Mod+click, which would open it twice.
      if (linkIn(event.target) !== null) event.preventDefault()
      if (anchor === null) return
      if (!fromKeyboard) {
        if (!(event.metaKey || event.ctrlKey)) return
        const moved = at === null ? 0 : Math.hypot(event.clientX - at.x, event.clientY - at.y)
        if (moved > STILL) return
      }
      const href = safeLink(anchor.getAttribute('href') ?? '')
      if (href === null) return
      event.preventDefault()
      window.open(href, '_blank', 'noopener,noreferrer')
    }

    container.addEventListener('pointerdown', onPointerDown, { capture: true })
    container.addEventListener('click', onClick, { capture: true })
    return () => {
      container.removeEventListener('pointerdown', onPointerDown, { capture: true })
      container.removeEventListener('click', onClick, { capture: true })
    }
  }, [containerRef])
}
