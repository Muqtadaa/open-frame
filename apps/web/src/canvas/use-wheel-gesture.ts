import { clampZoom, panViewport, zoomAtScreenPoint } from '@openframe/core'
import { useEffect, type RefObject } from 'react'

import { useInteractionStore } from '../interaction/interaction-store.js'

/**
 * How far a wheel has to travel, in normalised pixels, to double the zoom.
 *
 * At 200 one mouse notch — 100 pixels of delta — moved the zoom by about 39%,
 * which is nearly a whole step of the +/- ladder per click and far too coarse
 * to frame anything. Zoom is continuous here, not stepped, and this is the one
 * number that decides whether that feels like control or like lurching.
 */
const ZOOM_SENSITIVITY = 700

/**
 * A wheel event's delta is in whatever unit the DEVICE feels like reporting.
 *
 * A trackpad sends pixels; plenty of mice send lines, and a few send pages. A
 * single sensitivity applied to all three makes a mouse jump about sixteen
 * times further than a trackpad for the same physical gesture — which is what
 * "scroll zoom is not granular" turns out to mean on a mouse.
 */
const LINE_HEIGHT_PX = 16
const PAGE_HEIGHT_PX = 400

function deltaScale(event: WheelEvent): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return LINE_HEIGHT_PX
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return PAGE_HEIGHT_PX
  return 1
}

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
        const factor = Math.exp((-event.deltaY * deltaScale(event)) / ZOOM_SENSITIVITY)
        store.setViewport(
          zoomAtScreenPoint(store.viewport, anchor, clampZoom(store.viewport.zoom * factor)),
        )
        return
      }

      // Pan mode. Shift swaps the axis, matching the convention everywhere else.
      event.preventDefault()
      // Normalised here as well: a line-reporting mouse would otherwise pan a
      // sixteenth as far as a trackpad for the same gesture.
      const scale = deltaScale(event)
      const dx = (event.shiftKey ? -event.deltaY : -event.deltaX) * scale
      const dy = (event.shiftKey ? 0 : -event.deltaY) * scale
      store.setViewport(panViewport(store.viewport, dx, dy))
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [containerRef])
}
