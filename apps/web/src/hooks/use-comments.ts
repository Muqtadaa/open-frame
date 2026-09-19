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

/** A name goes into a pattern verbatim; people are allowed punctuation. */
function escapeForPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The people on the board that a piece of text names.
 *
 * Matched against the people actually here rather than parsed as free text: a
 * mention is a notification, and a notification to a name nobody has is a
 * message that silently goes nowhere.
 *
 * The match ENDS ON A BOUNDARY, which is the whole of the correctness here. A
 * plain substring search finds "@Sam" inside "@Samira", so writing to Samira
 * also notified Sam — somebody who was not being spoken to, on a board where
 * one name happens to begin another. Sorting the list by length did not fix
 * that and never could: it changes the order of the results, not which names
 * are found.
 *
 * Longest first AND consumed, for the other half of the same problem: with
 * both "Sam" and "Sam Smith" on a board, "@Sam Smith" ends on a boundary for
 * both of them. Taking the longer one out of the text first means the shorter
 * cannot also claim it.
 */
export function mentionsIn(text: string, people: readonly BoardPerson[]): string[] {
  const found: string[] = []
  let remaining = text
  const byLongest = [...people].sort((a, b) => b.displayName.length - a.displayName.length)
  for (const person of byLongest) {
    const pattern = new RegExp(
      `@${escapeForPattern(person.displayName)}(?![\\p{L}\\p{N}'-])`,
      'iu',
    )
    if (!pattern.test(remaining)) continue
    found.push(person.userId)
    remaining = remaining.replace(pattern, ' ')
  }
  return found
}

/**
 * A name that was typed at somebody who is not here, or `null`.
 *
 * Only a name that is not even the BEGINNING of somebody's — otherwise typing
 * "@Samira" one letter at a time reports "Sam" as a stranger on the way
 * through, and a warning that flashes while you type is noise you learn to
 * ignore. That forgiveness is the whole design: this exists to offer help, not
 * to mark an error.
 *
 * The first such name only. A composer is not a form to be validated; it is a
 * place to say something, and one offer to fix the problem is enough.
 */
export function unknownMentionIn(text: string, people: readonly BoardPerson[]): string | null {
  const names = people.map((person) => person.displayName.toLowerCase())
  for (const match of text.matchAll(/@([\p{L}\p{N}][\p{L}\p{N}'-]*)/gu)) {
    const typed = match[1]
    if (typed === undefined) continue
    const lower = typed.toLowerCase()
    // A prefix of somebody's name is somebody still being typed.
    if (names.some((name) => name.startsWith(lower))) continue
    return typed
  }
  return null
}
