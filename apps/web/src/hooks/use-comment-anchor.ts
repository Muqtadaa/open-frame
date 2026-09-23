import { useEffect, useRef } from 'react'

import { commentAnchor, COMMENT_PARAM } from '../app/collab-config.js'

/**
 * Arriving from a notification: go to the remark the link named.
 *
 * The going is `useFocusComment`, which the in-page click uses too. This is
 * only the part about a URL: when to look at it, and taking it back out.
 *
 * ONCE. The anchor describes an ARRIVAL rather than a location, so it is
 * consumed the first time it can be honoured — left in the address bar, every
 * later reload drags you back to a remark you have already read, and so does
 * every copy of the URL somebody pastes.
 *
 * It waits for the discussion, which loads asynchronously and is empty on the
 * first render. A link naming a comment that is no longer there does nothing:
 * the board is open, which is most of what was asked for, and a notice about
 * a remark nobody can see any more is not worth the interruption.
 */
export function useCommentAnchor(
  focus: (commentId: string) => boolean,
  ready: boolean,
  enabled: boolean,
): void {
  const done = useRef(false)

  useEffect(() => {
    if (!enabled || done.current) return
    if (typeof window === 'undefined') return

    const wanted = commentAnchor(window.location.search)
    if (wanted === null) return
    // Nothing to look in yet. Not `done`: it arrives a moment later.
    if (!ready) return

    done.current = true
    focus(wanted)
    forget()
  }, [focus, ready, enabled])
}

/**
 * Takes the anchor out of the address bar without reloading.
 *
 * The same thing the sign-in redirect does with its token, for the same
 * reason: a parameter that has been acted on should not still be in a URL
 * somebody might copy.
 */
function forget(): void {
  const url = new URL(window.location.href)
  if (!url.searchParams.has(COMMENT_PARAM)) return
  url.searchParams.delete(COMMENT_PARAM)
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}
