import { useCallback, useEffect, useState } from 'react'

import type { BoardId } from '@openframe/core'

import {
  boardPeople,
  listComments,
  type BoardComment,
  type BoardPerson,
} from '../adapters/supabase/comments.js'

/**
 * The discussion on a board.
 *
 * Loaded when the board opens and re-read after anything this browser writes.
 * NOT live across clients — there is no subscription here, so a comment
 * somebody else leaves appears on your next reload or your next write.
 *
 * That is a real limitation and it is chosen rather than overlooked. Comments
 * live in the database because a mention has to reach somebody who is not on
 * the board, and the room only knows who is connected; making them live as
 * well means either a second realtime channel or putting them in the CRDT,
 * which cannot notify anybody who is away. Refreshing on focus covers the case
 * that actually bites — coming back to a board after a conversation happened.
 */
export interface Discussion {
  readonly comments: readonly BoardComment[]
  readonly people: readonly BoardPerson[]
  readonly refresh: () => void
}

export function useComments(boardId: BoardId, enabled: boolean): Discussion {
  const [comments, setComments] = useState<readonly BoardComment[]>([])
  const [people, setPeople] = useState<readonly BoardPerson[]>([])
  const [revision, setRevision] = useState(0)

  const refresh = useCallback(() => {
    setRevision((current) => current + 1)
  }, [])

  useEffect(() => {
    if (!enabled) return
    let live = true

    void listComments(boardId).then((found) => {
      if (live) setComments(found)
    })
    void boardPeople(boardId).then((found) => {
      if (live) setPeople(found)
    })

    return () => {
      live = false
    }
  }, [boardId, enabled, revision])

  // Coming back to the board is when a conversation that happened while you
  // were away should appear.
  useEffect(() => {
    if (!enabled) return
    const onFocus = (): void => {
      refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
    }
  }, [enabled, refresh])

  return { comments, people, refresh }
}

/** Threads only — the ones with a pin — newest last, resolved ones excluded. */
export function openThreads(comments: readonly BoardComment[]): readonly BoardComment[] {
  return comments.filter(
    (comment) => comment.parentId === null && comment.resolvedAt === null,
  )
}

/** Every thread with a pin, including resolved ones. */
export function allThreads(comments: readonly BoardComment[]): readonly BoardComment[] {
  return comments.filter((comment) => comment.parentId === null)
}

/** The replies under one thread, oldest first. */
export function repliesTo(
  comments: readonly BoardComment[],
  threadId: string,
): readonly BoardComment[] {
  return comments.filter((comment) => comment.parentId === threadId)
}
