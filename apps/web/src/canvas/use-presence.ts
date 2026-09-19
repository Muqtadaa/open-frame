import { useEffect, type RefObject } from 'react'

import { screenToWorld } from '@openframe/core'

import { useLockedByOthers, usePeers } from '../hooks/use-peers.js'
import { useRemoteDragStore } from '../interaction/remote-drags.js'
import { dragsByObject } from '../scene/presence.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { guestIdentity } from '../app/guest.js'
import { useIdentity } from '../hooks/use-identity.js'

/**
 * Publishes where this person is and what they are holding, and keeps the
 * advisory lock in step with what everyone else is holding.
 *
 * Presence is the one thing that is allowed to move during a drag. Rule 4 says
 * nothing is written to the DOCUMENT until a gesture commits, and that is
 * exactly why a live drag has to be presence instead: watching somebody push a
 * note across the board is the whole point, and it costs no history, no undo
 * entry and no storage write.
 */

/**
 * Cursor updates, at most this often.
 *
 * A pointermove fires far faster than anyone can see, and each one is a message
 * to every other client in the room. Twenty a second is smooth to watch and an
 * order of magnitude below what the socket would otherwise carry.
 */
const CURSOR_INTERVAL_MS = 50

export function usePresence(containerRef: RefObject<HTMLDivElement | null>): void {
  const { collaboration } = useOpenFrame()
  const identity = useIdentity()
  const peers = usePeers()
  const locked = useLockedByOthers(peers)
  const setLockedByOthers = useInteractionStore((state) => state.setLockedByOthers)

  // What other people are holding open, into the store that refuses to edit it.
  useEffect(() => {
    setLockedByOthers(locked)
  }, [locked, setLockedByOthers])

  /*
   * And what they are holding in mid-air. Computed ONCE per presence update
   * rather than per object: culling already asks every visible object to draw
   * itself, and a peer scan inside each of them is the O(n²) rule 10 forbids.
   */
  const setDrags = useRemoteDragStore((state) => state.setDrags)
  useEffect(() => {
    setDrags(dragsByObject(peers))
  }, [peers, setDrags])

  useEffect(() => {
    if (collaboration === null || collaboration === undefined) return

    /*
     * A signed-in person is themselves; everyone else is a guest with an
     * invented name. Which one it is changes nothing downstream: presence has
     * never been an authorization, and a real name is no more trusted by the
     * room than "Curlew" is.
     */
    const guest = guestIdentity()
    const me =
      identity === null
        ? { name: guest.name, hue: guest.hue }
        : { name: identity.displayName, hue: identity.hue }
    let cursor: { x: number; y: number } | null = null
    let lastSent = 0
    let pending: ReturnType<typeof setTimeout> | null = null

    const publish = (): void => {
      lastSent = Date.now()
      pending = null
      const state = useInteractionStore.getState()
      collaboration.setPresence({
        name: me.name,
        hue: me.hue,
        cursor,
        selection: [...state.selection],
        editing: state.editingId,
        /*
         * The in-flight offset, which is what stops another person's note
         * teleporting when this one lets go of it. Read fresh on every publish
         * rather than pushed, so it rides the cursor's schedule for free: a
         * drag moves the pointer, and a pointer that moves is already
         * publishing.
         */
        drag:
          state.drag.kind === 'translate'
            ? { dx: state.drag.dx, dy: state.drag.dy }
            : null,
      })
    }

    const schedule = (): void => {
      if (pending !== null) return
      const wait = Math.max(0, CURSOR_INTERVAL_MS - (Date.now() - lastSent))
      pending = setTimeout(publish, wait)
    }

    const onPointerMove = (event: PointerEvent): void => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (rect === undefined) return
      cursor = screenToWorld(useInteractionStore.getState().viewport, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      })
      schedule()
    }

    const onPointerLeave = (): void => {
      // Otherwise a cursor stays frozen at the edge of the board for as long as
      // its owner is looking at another window.
      cursor = null
      publish()
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('blur', onPointerLeave)
    document.addEventListener('pointerleave', onPointerLeave)

    /*
     * Selection and the editing claim go out IMMEDIATELY rather than on the
     * cursor's schedule: a claim that arrives 50ms late is 50ms in which two
     * people can both believe they have the note.
     */
    const unsubscribe = useInteractionStore.subscribe((state, previous) => {
      if (state.selection !== previous.selection || state.editingId !== previous.editingId) {
        publish()
        return
      }
      /*
       * The START and END of a drag, immediately, on the same reasoning.
       *
       * The end matters most: on release the document takes the change and the
       * offset must go with it, in one frame. Left to the cursor's schedule it
       * lingers up to 50ms, and every watcher sees the note jump the distance
       * twice — once to the committed position, once back.
       */
      if (state.drag.kind !== previous.drag.kind) publish()
    })

    publish()

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('blur', onPointerLeave)
      document.removeEventListener('pointerleave', onPointerLeave)
      unsubscribe()
      if (pending !== null) clearTimeout(pending)
      collaboration.setPresence(null)
    }
  }, [collaboration, containerRef, identity])
}
