import { useEffect, useRef, useState } from 'react'

import { useInteractionStore } from '../interaction/interaction-store.js'

/**
 * Whether the board is being moved right now.
 *
 * Used to promote the world layer only WHILE it moves. `will-change:
 * transform` left on permanently tells the browser to keep the layer in its
 * own texture and transform that texture — which is what makes panning cheap
 * and is also the documented way to end up scaling a cached bitmap instead of
 * re-rasterising at the new zoom.
 *
 * MDN is explicit that `will-change` is a last resort and should not be left
 * on an element indefinitely. Applying it for the length of a gesture is the
 * shape it was designed for: smooth while moving, and an ordinary element the
 * rest of the time, free to re-render at whatever scale it is now drawn at.
 */

/**
 * How long after the last change the board is still considered to be moving.
 *
 * A wheel gesture arrives as a burst of separate events with gaps between
 * them, so dropping the hint the instant one lands would take the layer down
 * and rebuild it several times during a single scroll.
 */
const SETTLE_MS = 180

export function useMoving(): boolean {
  const [moving, setMoving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    /*
     * Subscribed directly rather than selected into React state: this fires
     * on every frame of a pan, and a component that re-rendered each time
     * would cost more than the hint saves.
     */
    const stop = useInteractionStore.subscribe((state, previous) => {
      if (state.viewport === previous.viewport && state.drag.kind === previous.drag.kind) return

      setMoving(true)
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        setMoving(false)
      }, SETTLE_MS)
    })

    return () => {
      stop()
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [])

  return moving
}
