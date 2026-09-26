import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { useCommentAnchor } from '../hooks/use-comment-anchor.js'
import { useComments } from '../hooks/use-comments.js'
import { useFocusComment } from '../hooks/use-focus-comment.js'
import { useLiveComments } from '../hooks/use-live-comments.js'
import { useIdentity } from '../hooks/use-identity.js'
import { CommentPanel } from '../ui/CommentPanel.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { CommentsContext, useDiscussion, type Discussion } from './comments-context.js'

/**
 * Loads the discussion once, for the pins and the panel both.
 *
 * ABSENT ENTIRELY for a board that is nobody else's, or for somebody not
 * signed in. Comments need an author and somebody to read them; a board with
 * neither is the whole feature as apparatus around nothing.
 */
export function CommentsProvider({ children }: { readonly children: ReactNode }) {
  const { runtime, collaboration } = useOpenFrame()
  const identity = useIdentity()
  const enabled = collaboration !== null && collaboration !== undefined && identity !== null

  const { comments, people, refresh, post, resolve } = useComments(runtime.boardId, enabled)

  // And again whenever somebody else in the room says something, so the
  // discussion is live rather than something you find on your way back.
  useLiveComments(enabled, refresh)

  /*
   * Going to a remark, and the two ways of asking for it: a link with `?c=`,
   * and a notification clicked while already on this board. One
   * implementation, because two answers to "take me to this comment" is how
   * one of them quietly stops matching the other.
   */
  const focusComment = useFocusComment(comments)
  useCommentAnchor(focusComment, comments.length > 0, enabled)

  const value = useMemo<Discussion>(() => {
    const replyCounts = new Map<string, number>()
    for (const comment of comments) {
      if (comment.parentId === null) continue
      replyCounts.set(comment.parentId, (replyCounts.get(comment.parentId) ?? 0) + 1)
    }
    return {
      boardId: runtime.boardId,
      comments,
      people,
      replyCounts,
      refresh,
      post,
      resolve,
      focusComment,
      enabled,
    }
  }, [runtime, comments, people, refresh, post, resolve, focusComment, enabled])

  return <CommentsContext.Provider value={value}>{children}</CommentsContext.Provider>
}

/**
 * The conversation itself, beside the board rather than on it.
 *
 * KEYED on what is being written into, so React remounts the panel when that
 * changes and it starts from that target's own state. The words typed into it
 * are the exception: they live in `useCommentDrafts`, outside the panel, so a
 * remount restores them instead of losing them.
 */
export function Comments() {
  const { enabled, comments } = useDiscussion()
  const me = useIdentity()
  const composing = useInteractionStore((state) => state.composing)
  const openThreadId = useInteractionStore((state) => state.openThreadId)
  const commentsOpen = useInteractionStore((state) => state.commentsOpen)
  const open = composing !== null || openThreadId !== null || commentsOpen

  /*
   * Where the keyboard was when the panel opened, and where it goes back to
   * when the panel closes. Posting, Close, Escape and Resolve all left focus
   * on the page's body — somebody working by keyboard was sent back to the
   * top of the document after every remark. A pin that was pressed gets it
   * back; otherwise the comment tool does.
   */
  const returnTo = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  /*
   * Tracked as focus MOVES rather than read when the panel opens: the panel
   * takes the keyboard in its own effect, which runs before this component's,
   * so by then the answer is always "the reply box".
   */
  useEffect(() => {
    const note = (event: FocusEvent): void => {
      const target = event.target
      if (target instanceof HTMLElement && target.closest('.of-comment-panel') === null) {
        returnTo.current = target
      }
    }
    window.addEventListener('focusin', note)
    return () => {
      window.removeEventListener('focusin', note)
    }
  }, [])
  useEffect(() => {
    const active = document.activeElement
    if (!open && wasOpen.current && (active === null || active === document.body)) {
      const back =
        returnTo.current?.isConnected === true
          ? returnTo.current
          : document.querySelector<HTMLElement>('[data-testid="tool-comment"]')
      back?.focus()
    }
    wasOpen.current = open
  }, [open])

  /*
   * Somebody else's remark ARRIVING is said, politely. A reply landing in
   * the thread you have open appeared on screen and announced nothing; a
   * discussion a screen reader cannot hear happen is one it cannot join.
   * Only what arrives after this board was opened, and never your own.
   */
  const [mountedAt] = useState(() => Date.now())
  const seen = useRef<ReadonlySet<string>>(new Set())
  const [arrived, setArrived] = useState('')
  useEffect(() => {
    const fresh = comments.filter(
      (comment) =>
        !seen.current.has(comment.id) &&
        comment.authorId !== me?.userId &&
        comment.createdAt >= mountedAt - 5000,
    )
    seen.current = new Set(comments.map((comment) => comment.id))
    const last = fresh[fresh.length - 1]
    if (last === undefined) return
    setArrived(`${last.authorName} ${last.parentId === null ? 'commented' : 'replied'}`)
  }, [comments, me, mountedAt])

  if (!enabled) return null

  const target =
    openThreadId ??
    (composing === null ? 'none' : `new:${String(composing.x)},${String(composing.y)}`)

  return (
    <>
      <CommentPanel key={target} />
      <p className="of-visually-hidden" aria-live="polite" data-testid="comment-arrivals">
        {arrived}
      </p>
    </>
  )
}
