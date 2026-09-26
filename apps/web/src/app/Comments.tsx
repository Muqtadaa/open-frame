import { useMemo, type ReactNode } from 'react'

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
  const { enabled } = useDiscussion()
  const composing = useInteractionStore((state) => state.composing)
  const openThreadId = useInteractionStore((state) => state.openThreadId)
  if (!enabled) return null

  const target =
    openThreadId ??
    (composing === null ? 'none' : `new:${String(composing.x)},${String(composing.y)}`)

  return <CommentPanel key={target} />
}
