import { clampZoom, panViewport, zoomAtScreenPoint } from '@openframe/core'
import { useEffect, type RefObject } from 'react'

import { useInteractionStore } from '../interaction/interaction-store.js'

/** Tuned so one notch of a mouse wheel is roughly one perceptual zoom step. */
const ZOOM_SENSITIVITY = 200

/**
 * Wheel handling, attached as a NATIVE NON-PASSIVE listener.
 *
 * React registers `wheel` passively, which means `preventDefault()` inside an
 * `onWheel` prop silently does nothing. The visible symptom is the browser's
 * own zoom firing on Ctrl+scroll and trackpad pinch *in addition to* the
 * canvas zoom, so the page and the board scale at once and the view falls
 * apart. The only fix is to bypass React's synthetic event system here.
 *
 * Ctrl/Cmd + wheel is always treated as zoom regardless of preference: that is
 * what a trackpad pinch reports as, and it is also the browser's zoom
 * shortcut — so it must be intercepted or the two compound.
 */
export function useWheelGesture(containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = containerRef.current
    if (element === null) return

    const onWheel = (event: WheelEvent): void => {
      const store = useInteractionStore.getState()
      const rect = element.getBoundingClientRect()
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      const pinching = event.ctrlKey || event.metaKey

      if (pinching || store.wheelMode === 'zoom') {
        event.preventDefault()
        const factor = Math.exp(-event.deltaY / ZOOM_SENSITIVITY)
        store.setViewport(
          zoomAtScreenPoint(store.viewport, anchor, clampZoom(store.viewport.zoom * factor)),
        )
        return
      }

      // Pan mode. Shift swaps the axis, matching the convention everywhere else.
      event.preventDefault()
      const dx = event.shiftKey ? -event.deltaY : -event.deltaX
      const dy = event.shiftKey ? 0 : -event.deltaY
      store.setViewport(panViewport(store.viewport, dx, dy))
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [containerRef])
}
