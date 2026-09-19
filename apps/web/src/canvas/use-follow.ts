import { useEffect, useRef } from 'react'

import type { Viewport } from '@openframe/core'

import { usePeers } from '../hooks/use-peers.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { canFollow } from '../scene/presence.js'

/**
 * Riding somebody else's viewport around the board.
 *
 * Everything needed was already on the presence channel except the viewport
 * itself; this is the part that consumes it.
 *
 * TWO WAYS OUT, and both matter. Moving the board yourself stops following —
 * anything else means the person you are following fights your scroll wheel,
 * and the interface would be taking the board away from you. And the person
 * you are following leaving, or starting to follow somebody themselves, also
 * stops it, because there is no longer a viewport of their own to copy.
 */
export function useFollow(): void {
  const peers = usePeers()
  const following = useInteractionStore((state) => state.following)
  const setFollowing = useInteractionStore((state) => state.setFollowing)
  const setViewport = useInteractionStore((state) => state.setViewport)

  /*
   * The last viewport this hook itself applied.
   *
   * It is what tells "they moved, so I moved" apart from "I moved". Without
   * it, following would end on its own first frame: applying their viewport is
   * a local viewport change like any other, and the escape below would read it
   * as the user grabbing the board.
   */
  const applied = useRef<Viewport | null>(null)

  useEffect(() => {
    if (following === null) {
      applied.current = null
      return
    }

    const target = peers.find((peer) => peer.clientId === following)
    // Gone, or now a follower themselves. Either way there is nothing of their
    // own left to copy, so stop rather than freeze on their last position.
    if (target === undefined || !canFollow(target)) {
      setFollowing(null)
      return
    }

    const seat = target.viewport
    if (seat === null) return
    const here = useInteractionStore.getState().viewport
    if (here.x === seat.x && here.y === seat.y && here.zoom === seat.zoom) return

    applied.current = seat
    setViewport(seat)
  }, [peers, following, setFollowing, setViewport])

  // The escape: the moment the viewport becomes something this hook did not
  // put there, the person has taken the board back.
  useEffect(() => {
    if (following === null) return
    return useInteractionStore.subscribe((state, previous) => {
      if (state.viewport === previous.viewport) return
      const mine = applied.current
      if (
        mine !== null &&
        state.viewport.x === mine.x &&
        state.viewport.y === mine.y &&
        state.viewport.zoom === mine.zoom
      ) {
        return
      }
      setFollowing(null)
    })
  }, [following, setFollowing])
}
