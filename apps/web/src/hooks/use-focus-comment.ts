import { useCallback } from 'react'

import { useInteractionStore } from '../interaction/interaction-store.js'
import { pinPosition } from '../scene/comment-pin.js'
import { centreOn } from '../scene/zoom.js'
import { useOpenFrame } from '../runtime/context.js'
import type { BoardComment } from './use-comments.js'

/**
 * Go to a remark: open its thread, and put its pin in the middle of the board.
 *
 * ONE implementation for two callers — arriving from a link with `?c=`, and
 * clicking a notification for the board you are already on. They were about to
 * be two, and two answers to "take me to this comment" is how one of them
 * quietly stops matching the other.
 *
 * CENTRED, not revealed. `panToReveal` moves as little as possible, which is
 * right for something the user did here and wrong for somebody following a
 * link that says "look at this": the minimum pan leaves the pin at the very
 * edge of the screen, and a pin that was already in view does not move at
 * all — which reads as the link not having worked.
 *
 * Returns whether it found the comment, so a caller can tell "gone" from
 * "done" rather than assuming.
 */
export function useFocusComment(
  comments: readonly BoardComment[],
): (commentId: string) => boolean {
  const { runtime } = useOpenFrame()
  const openThread = useInteractionStore((state) => state.openThread)
  const setCommentsOpen = useInteractionStore((state) => state.setCommentsOpen)

  return useCallback(
    (commentId: string): boolean => {
      const found = comments.find((comment) => comment.id === commentId)
      if (found === undefined) return false

      /*
       * A REPLY opens the thread it is under, not itself. The panel shows a
       * conversation; there is nowhere for a reply to be opened on its own,
       * and the pin belongs to the thread in any case.
       */
      const thread =
        found.parentId === null
          ? found
          : (comments.find((comment) => comment.id === found.parentId) ?? found)

      openThread(thread.id)
      setCommentsOpen(true)

      const document = runtime.store.getDocument()
      const object =
        thread.objectId === null ? undefined : document.objects.get(thread.objectId)
      /*
       * `boundsOf`, never `object.frame` — a connector has no meaningful frame
       * and asking for one puts the pin at the origin.
       */
      const bounds = object === undefined ? null : runtime.registry.boundsOf(object, document)
      const at = pinPosition(thread, bounds)
      if (at === null) return true

      const { viewport, canvasSize } = useInteractionStore.getState()
      /*
       * A canvas that has not been measured yet cannot be centred on, and
       * centring against zero puts the board somewhere nobody asked for. The
       * thread is open either way, which is the half that does not depend on
       * geometry.
       */
      if (canvasSize.width < 1 || canvasSize.height < 1) return true

      useInteractionStore
        .getState()
        .setViewport(centreOn(viewport, at, canvasSize.width, canvasSize.height, panelInset()))
      return true
    },
    [comments, openThread, setCommentsOpen, runtime],
  )
}

/**
 * How much of the right-hand side the comment panel is taking, or none.
 *
 * Read from the DOM rather than copied from the stylesheet, which is the
 * fallback rule 15 names for geometry that only exists once the browser has
 * drawn it. Zero on a fresh arrival is the honest answer rather than a miss:
 * the panel opens as a RESULT of this, so there is nothing to measure yet,
 * and the middle of a window clears a 324px panel on anything wider than
 * about 650.
 */
function panelInset(): number {
  if (typeof window === 'undefined') return 0
  const panel = window.document.querySelector<HTMLElement>('[data-testid="comment-panel"]')
  if (panel === null) return 0
  const box = panel.getBoundingClientRect()
  return Math.max(0, window.document.documentElement.clientWidth - box.left)
}
