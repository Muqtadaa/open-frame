import { useMemo, type ReactNode } from 'react'

import { useComments } from '../hooks/use-comments.js'
import { useIdentity } from '../hooks/use-identity.js'
import { CommentPanel } from '../ui/CommentPanel.js'
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

  const { comments, people, refresh } = useComments(runtime.boardId, enabled)

  const value = useMemo<Discussion>(() => {
    const replyCounts = new Map<string, number>()
    for (const comment of comments) {
      if (comment.parentId === null) continue
      replyCounts.set(comment.parentId, (replyCounts.get(comment.parentId) ?? 0) + 1)
    }
    return { comments, people, replyCounts, refresh, enabled }
  }, [comments, people, refresh, enabled])

  return <CommentsContext.Provider value={value}>{children}</CommentsContext.Provider>
}

/** The conversation itself, beside the board rather than on it. */
export function Comments() {
  const { comments, people, refresh, enabled } = useDiscussion()
  if (!enabled) return null
  return <CommentPanel comments={comments} people={people} onChanged={refresh} />
}
