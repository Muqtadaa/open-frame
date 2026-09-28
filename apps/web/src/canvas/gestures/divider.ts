import type { PointerEvent as ReactPointerEvent } from 'react'

import {
  gestureAt,
  type Gesture,
  type GestureContext,
  type GestureHandler,
  type InteractionSnapshot,
} from './types.js'

/**
 * Grabbing a division inside an object, which the REGISTRY named.
 *
 * Nothing type-specific here: the handle carries its own id, the registry
 * turns a position into a data patch, and this only has to know that both
 * exist. The same handshake the endpoint handles use.
 */
export function beginDividerDrag(
  { runtime, toWorld }: GestureContext,
  event: ReactPointerEvent<HTMLElement>,
  store: InteractionSnapshot,
): Gesture | null {
  const element = event.target instanceof HTMLElement ? event.target : null
  const dividerId = element?.closest<HTMLElement>('[data-divider-id]')?.dataset.dividerId
  if (dividerId === undefined) return null

  const [selectedId] = [...store.selection]
  const doc = runtime.store.getDocument()
  const object = selectedId === undefined ? undefined : doc.objects.get(selectedId)
  if (object === undefined || selectedId === undefined) return null

  store.beginDivider(selectedId, dividerId)

  return gestureAt(event, 'divider', toWorld(event.clientX, event.clientY), store.viewport, {
    subjects: [object],
    startBounds: runtime.registry.boundsOf(object, doc),
    dividerId,
  })
}

export const divider: GestureHandler = {
  move: ({ runtime }, active, _event, worldPoint, store) => {
    const bounds = active.startBounds
    const [subject] = active.subjects
    if (bounds === null || subject === undefined || active.dividerId === undefined) return

    /*
     * The pointer as a FRACTION of the object, which is the only unit the
     * type understands. Bounds are the ones taken at gesture start: rule
     * 17's reasoning, and here also because nothing has moved — the
     * document is untouched until the pointer comes up.
     */
    const along =
      bounds.width === 0 || bounds.height === 0
        ? 0
        : active.dividerId.startsWith('c')
          ? (worldPoint.x - bounds.x) / bounds.width
          : (worldPoint.y - bounds.y) / bounds.height

    const moved = runtime.registry.moveDivider(subject, active.dividerId, along)
    if (moved !== null) {
      active.moved = true
      /*
       * The data AND the size it needs. Resizing one track no longer takes
       * the space from its neighbour, so the table itself grows — and the
       * preview has to show that, or the drag looks like it is doing
       * nothing past the point the old model would have stopped at.
       */
      store.previewDivider(moved.data, moved.grow)
    }
  },

  /*
   * THE COMMIT for a divider: one command carrying the whole drag.
   *
   * Read from the live drag state rather than recomputed here, so what is
   * written is exactly what was on screen — and `moved` gates it, because
   * a press that never moved is a click on a handle, not a resize, and
   * must not put an entry in the undo stack.
   */
  commit: ({ commands }, active, _event, store) => {
    const drag = store.drag
    const subject = active.subjects[0]
    if (drag.kind !== 'divider' || drag.data === null || !active.moved || subject === undefined) {
      return
    }
    /*
     * ONE transaction for the two changes. Weights are data and a frame
     * is geometry, so they are two commands — but they are one action,
     * and undoing a drag has to put both back.
     */
    commands.resizeDivider(drag.objectId, drag.data, {
      ...subject.frame,
      width: subject.frame.width + drag.grow.width,
      height: subject.frame.height + drag.grow.height,
    })
  },
}
