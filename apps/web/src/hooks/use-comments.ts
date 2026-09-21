import { useCallback, useEffect, useState } from 'react'

import type { BoardId } from '@openframe/core'

import { useInteractionStore } from '../interaction/interaction-store.js'

import {
  boardPeople,
  listComments,
  postComment,
  resolveComment,
  type BoardComment,
  type BoardPerson,
  type NewComment,
} from '../app/discussion.js'

/*
 * Re-exported so the interface never imports the adapter itself. `ui` and
 * `canvas` must not reach persistence directly — they go through commands and
 * hooks, and this is the hook.
 */
export type { BoardComment, BoardPerson, NewComment }

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
export interface LoadedComments {
  readonly comments: readonly BoardComment[]
  readonly people: readonly BoardPerson[]
  readonly refresh: () => void
  /** Writes a comment and its mentions, then re-reads. */
  readonly post: (comment: NewComment) => Promise<boolean>
  readonly resolve: (id: string, resolved: boolean) => Promise<boolean>
}

export function useComments(boardId: BoardId, enabled: boolean): LoadedComments {
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

  /*
   * Both writers do the same two things on success: re-read for this client,
   * and raise the counter that tells everybody else in the room to do the
   * same. The nudge goes out only after the database has accepted the change,
   * so nobody is ever sent to look at something that was not written.
   */
  const noteSaid = useInteractionStore((state) => state.noteSaid)

  const post = useCallback(
    async (comment: NewComment): Promise<boolean> => {
      const id = await postComment(comment)
      if (id === null) return false
      refresh()
      noteSaid()
      return true
    },
    [refresh, noteSaid],
  )

  const resolve = useCallback(
    async (id: string, resolved: boolean): Promise<boolean> => {
      const ok = await resolveComment(id, resolved)
      if (!ok) return false
      refresh()
      noteSaid()
      return true
    },
    [refresh, noteSaid],
  )

  return { comments, people, refresh, post, resolve }
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

/*
 * The text rules live in their own module — they are pure, and a React hooks
 * file is not where a parser belongs. Re-exported so the interface still has
 * one import for "the discussion", and so no caller had to change.
 */
export {
  activeMentionQuery,
  insertMention,
  mentionSegments,
  mentionToken,
  mentionsIn,
  peopleMatching,
  plainMentionText,
  unknownMentionIn,
  type BodySegment,
  type MentionQuery,
} from './mentions-in-text.js'
