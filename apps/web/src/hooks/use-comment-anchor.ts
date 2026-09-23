import { useEffect, useRef } from 'react'

import { commentAnchor, COMMENT_PARAM } from '../app/collab-config.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { pinPosition } from '../scene/comment-pin.js'
import { panToReveal } from '../scene/zoom.js'
import { useOpenFrame } from '../runtime/context.js'
import type { BoardComment } from './use-comments.js'

/**
 * Arriving from a notification: open the remark it was about, and go to it.
 *
 * A mention link used to be the plain share link, so following one reopened
 * the board at whatever view it starts at, with no thread open and no pin
 * marked — indistinguishable from clicking the board in the list, and no
 * answer at all to "somebody mentioned you HERE".
 *
 * ONCE. The anchor is consumed the first time it can be honoured, and taken
 * out of the URL afterwards, because it describes an arrival rather than a
 * location: leaving it there means every later reload drags you back to a
 * remark you have already read, and every copy of the address in a chat
 * window does the same to somebody else.
 *
 * It waits for the discussion, which is loaded asynchronously and is empty on
 * the first render. A mention for a comment that is no longer there — deleted,
 * or on a board this account has lost access to — simply does nothing: the
 * board is open, which is most of what was asked for, and a notice about a
 * remark somebody can no longer see is not worth the interruption.
 */
export function useCommentAnchor(comments: readonly BoardComment[], enabled: boolean): void {
  const { runtime } = useOpenFrame()
  const openThread = useInteractionStore((state) => state.openThread)
  const setCommentsOpen = useInteractionStore((state) => state.setCommentsOpen)
  const done = useRef(false)

  useEffect(() => {
    if (!enabled || done.current) return
    if (typeof window === 'undefined') return

    const wanted = commentAnchor(window.location.search)
    if (wanted === null) return
    // Nothing to look in yet. Not `done`, because it arrives a moment later.
    if (comments.length === 0) return

    const found = comments.find((comment) => comment.id === wanted)
    if (found === undefined) {
      // The discussion has loaded and this is not in it. Stop looking rather
      // than re-checking on every later change to the thread.
      done.current = true
      forget()
      return
    }
    done.current = true

    /*
     * A REPLY opens the thread it is under, not itself. The panel shows a
     * conversation; there is nowhere for a reply to be opened on its own, and
     * the pin belongs to the thread in any case.
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
    if (at !== null) {
      const { viewport, canvasSize } = useInteractionStore.getState()
      /*
       * `panToReveal` rather than a centring jump, and no zoom change: the
       * pin only has to be ON SCREEN. Reframing the board would throw away
       * the view somebody was already in the middle of when the link was a
       * board they had open, and centring puts the remark behind the panel
       * that is about to open over it.
       */
      useInteractionStore.getState().setViewport(
        panToReveal(
          viewport,
          { x: at.x - 40, y: at.y - 40, width: 80, height: 80 },
          canvasSize.width,
          canvasSize.height,
        ),
      )
    }

    forget()
  }, [comments, enabled, openThread, setCommentsOpen, runtime])
}

/**
 * Takes the anchor out of the address bar without reloading.
 *
 * The same thing the sign-in redirect does with its token, for the same
 * reason: a parameter that has been acted on is a parameter that should not
 * still be in a URL somebody might copy.
 */
function forget(): void {
  const url = new URL(window.location.href)
  if (!url.searchParams.has(COMMENT_PARAM)) return
  url.searchParams.delete(COMMENT_PARAM)
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}
