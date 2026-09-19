import { useMemo, type ReactNode } from 'react'

import { useComments } from '../hooks/use-comments.js'
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

  const value = useMemo<Discussion>(() => {
    const replyCounts = new Map<string, number>()
    for (const comment of comments) {
      if (comment.parentId === null) continue
      replyCounts.set(comment.parentId, (replyCounts.get(comment.parentId) ?? 0) + 1)
    }
    return { comments, people, replyCounts, refresh, post, resolve, enabled }
  }, [comments, people, refresh, post, resolve, enabled])

  return <CommentsContext.Provider value={value}>{children}</CommentsContext.Provider>
}

/**
 * The conversation itself, beside the board rather than on it.
 *
 * KEYED on what is being written into, so React remounts the panel when that
 * changes. Clearing a half-typed draft is then something the component does by
 * being new, rather than an effect that reaches back into its own state — the
 * draft belongs to the thing it was being typed into.
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
