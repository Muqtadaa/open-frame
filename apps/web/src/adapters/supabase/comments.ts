import type { BoardId, ObjectId } from '@openframe/core'

import { supabaseClient } from './client.js'

/**
 * Comments on a board, and the mentions that notify people about them.
 *
 * Every read goes through a database function rather than a table, for the
 * same reason the board list does: `profiles` is readable only by its owner,
 * so a client cannot turn an `author_id` into a name by joining. Loosening
 * that table would make every display name in the system readable by every
 * account, to solve a problem that only exists between people who already
 * share a board.
 *
 * Failure is an empty list or `false`, never a throw — a board must open and
 * edit with no network at all. What an unreachable database costs here is the
 * DISCUSSION, not the board.
 */

export interface BoardComment {
  readonly id: string
  /** `null` on a thread; the thread's id on a reply. */
  readonly parentId: string | null
  readonly authorId: string
  readonly authorName: string
  readonly authorHue: number
  readonly body: string
  /** Where the pin sits, in board coordinates. `null` on a reply. */
  readonly x: number | null
  readonly y: number | null
  /**
   * What it was dropped on, if anything.
   *
   * An object that is later deleted leaves the comment exactly where it was
   * put, and the interface says what it was attached to is gone.
   */
  readonly objectId: ObjectId | null
  /**
   * WHERE on that element, as a proportion of its box.
   *
   * `0.5, 0.5` is the middle; `1, 0` is the top-right corner. A proportion
   * rather than an offset so the pin survives a RESIZE as well as a move —
   * the corner somebody was objecting to stays the corner.
   *
   * `null` on a comment that is not on an element, and on every comment
   * written before this existed. Those keep their own `x` and `y`, which is
   * also the fallback for an anchored comment whose element has been deleted:
   * a fraction of something that is gone is not a position, and the pin has to
   * go somewhere.
   */
  readonly fx: number | null
  readonly fy: number | null
  readonly resolvedAt: number | null
  readonly createdAt: number
}

export interface BoardPerson {
  readonly userId: string
  readonly displayName: string
  readonly hue: number
}

export interface Mention {
  readonly commentId: string
  readonly boardId: BoardId
  readonly boardTitle: string
  readonly authorName: string
  readonly body: string
  readonly createdAt: number
}

/** Milliseconds from a timestamp the database wrote, or `null`. */
function when(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** A proportion of an element's box, or `null` for anything that is not one. */
function fraction(value: unknown): number | null {
  const found = finite(value)
  if (found === null) return null
  return Math.min(1, Math.max(0, found))
}

function readComment(row: unknown): BoardComment | null {
  if (typeof row !== 'object' || row === null) return null
  const {
    id,
    parent_id: parentId,
    author_id: authorId,
    author_name: authorName,
    author_hue: authorHue,
    body,
    x,
    y,
    object_id: objectId,
    resolved_at: resolvedAt,
    created_at: createdAt,
    fx,
    fy,
  } = row as {
    id?: unknown
    parent_id?: unknown
    author_id?: unknown
    author_name?: unknown
    author_hue?: unknown
    body?: unknown
    x?: unknown
    y?: unknown
    object_id?: unknown
    resolved_at?: unknown
    created_at?: unknown
    fx?: unknown
    fy?: unknown
  }

  if (typeof id !== 'string' || typeof body !== 'string' || typeof authorId !== 'string') {
    return null
  }

  return {
    id,
    parentId: typeof parentId === 'string' ? parentId : null,
    authorId,
    authorName: typeof authorName === 'string' ? authorName : 'Someone',
    authorHue: typeof authorHue === 'number' ? authorHue : 0,
    body,
    x: finite(x),
    y: finite(y),
    objectId: typeof objectId === 'string' ? (objectId as ObjectId) : null,
    resolvedAt: when(resolvedAt),
    createdAt: when(createdAt) ?? 0,
    // Clamped, not merely checked: a fraction outside the box would put the
    // pin somewhere that is not on the element it claims to be on. The
    // database refuses these too — this is the same rule at the other end,
    // because a reader is a boundary and the database is not the only thing
    // that has ever been wrong.
    fx: fraction(fx),
    fy: fraction(fy),
  }
}

/** Every comment on a board, threads and replies together, oldest first. */
export async function listComments(boardId: BoardId): Promise<readonly BoardComment[]> {
  const client = supabaseClient()
  if (client === null) return []

  const response = (await client.rpc('board_comments_for', { p_board_id: boardId })) as {
    data: unknown
    error: unknown
  }
  if (response.error !== null || !Array.isArray(response.data)) return []

  const comments: BoardComment[] = []
  for (const row of response.data) {
    const comment = readComment(row)
    if (comment !== null) comments.push(comment)
  }
  return comments
}

/** Who is on this board, for putting a name to a comment and for mentioning. */
export async function boardPeople(boardId: BoardId): Promise<readonly BoardPerson[]> {
  const client = supabaseClient()
  if (client === null) return []

  const response = (await client.rpc('board_people', { p_board_id: boardId })) as {
    data: unknown
    error: unknown
  }
  if (response.error !== null || !Array.isArray(response.data)) return []

  const people: BoardPerson[] = []
  for (const row of response.data) {
    if (typeof row !== 'object' || row === null) continue
    const { user_id: userId, display_name: displayName, hue } = row as {
      user_id?: unknown
      display_name?: unknown
      hue?: unknown
    }
    if (typeof userId !== 'string') continue
    people.push({
      userId,
      displayName: typeof displayName === 'string' ? displayName : 'Someone',
      hue: typeof hue === 'number' ? hue : 0,
    })
  }
  return people
}

export interface NewComment {
  readonly boardId: BoardId
  readonly body: string
  /** Set on a reply, absent on a thread. */
  readonly parentId?: string
  /** Set on a thread, absent on a reply. */
  readonly at?: { readonly x: number; readonly y: number }
  readonly objectId?: ObjectId | null
  /**
   * Where on that element, as a proportion of its box. Set together with
   * `objectId` or not at all — a fraction of nothing is not a position, and
   * the database refuses one.
   */
  readonly on?: { readonly fx: number; readonly fy: number }
  readonly mentions?: readonly string[]
}

/**
 * Writes a comment and its mentions in one call.
 *
 * One call because they are one act: a comment posted without its mentions
 * notifies nobody, and a client that failed between two calls would leave
 * exactly that — a mention that silently never happened, which is worse than
 * an error because nothing looks wrong.
 */
export async function postComment(comment: NewComment): Promise<string | null> {
  const client = supabaseClient()
  if (client === null) return null

  const response = (await client.rpc('post_comment', {
    p_board_id: comment.boardId,
    p_body: comment.body,
    p_parent_id: comment.parentId ?? null,
    p_x: comment.at?.x ?? null,
    p_y: comment.at?.y ?? null,
    p_object_id: comment.objectId ?? null,
    p_mentions: comment.mentions ?? [],
    p_fx: comment.on?.fx ?? null,
    p_fy: comment.on?.fy ?? null,
  })) as { data: unknown; error: unknown }

  return response.error === null && typeof response.data === 'string' ? response.data : null
}

/** Marks a thread finished, or opens it again. Anybody on the board may. */
export async function resolveComment(id: string, resolved: boolean): Promise<boolean> {
  const client = supabaseClient()
  if (client === null) return false

  const response = (await client.rpc('resolve_comment', {
    p_id: id,
    p_resolved: resolved,
  })) as { data: unknown; error: unknown }

  return response.error === null && response.data === true
}

/** What you have been told about and not yet read. */
export async function myMentions(): Promise<readonly Mention[]> {
  const client = supabaseClient()
  if (client === null) return []

  const response = (await client.rpc('my_mentions')) as { data: unknown; error: unknown }
  if (response.error !== null || !Array.isArray(response.data)) return []

  const mentions: Mention[] = []
  for (const row of response.data) {
    if (typeof row !== 'object' || row === null) continue
    const {
      comment_id: commentId,
      board_id: boardId,
      board_title: boardTitle,
      author_name: authorName,
      body,
      created_at: createdAt,
    } = row as {
      comment_id?: unknown
      board_id?: unknown
      board_title?: unknown
      author_name?: unknown
      body?: unknown
      created_at?: unknown
    }
    if (typeof commentId !== 'string' || typeof boardId !== 'string') continue
    mentions.push({
      commentId,
      boardId: boardId as BoardId,
      boardTitle: typeof boardTitle === 'string' ? boardTitle : 'A board',
      authorName: typeof authorName === 'string' ? authorName : 'Someone',
      body: typeof body === 'string' ? body : '',
      createdAt: when(createdAt) ?? 0,
    })
  }
  return mentions
}

/** Marks mentions read, so they stop being a notification. */
export async function markMentionsRead(commentIds: readonly string[]): Promise<boolean> {
  const client = supabaseClient()
  if (client === null || commentIds.length === 0) return false

  const response = (await client
    .from('comment_mentions')
    .update({ read_at: new Date().toISOString() })
    .in('comment_id', [...commentIds])) as { error: unknown }

  return response.error === null
}

/**
 * Calls back when a mention for `userId` is written or changes.
 *
 * The callback takes NOTHING. What arrives on the wire is a row from
 * `comment_mentions` — a comment id, a user id, a read timestamp — and none of
 * the things the bell shows: who said it, on which board, or what it said.
 * Building a notification out of that row would need the joins that
 * `my_mentions()` already does under `security definer`, so the event is
 * treated as a NUDGE and the list is re-read from the database.
 *
 * That is the same choice `use-live-comments.ts` makes about the room socket,
 * for the same reason: one source of truth about what was said, and no way for
 * two clients to disagree about it because a message arrived out of order.
 *
 * Filtered to one user server-side. Row-level security already means nobody
 * is sent somebody else's mentions, but without the filter every subscriber is
 * WOKEN by every mention on the instance and then told it may not see it.
 *
 * Returns a function that stops listening. A caller that forgets it leaks a
 * socket subscription per board opened.
 */
export function watchMyMentions(userId: string, onChange: () => void): () => void {
  const client = supabaseClient()
  if (client === null) return () => undefined

  const channel = client
    .channel(`mentions:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'comment_mentions',
        filter: `user_id=eq.${userId}`,
      },
      () => {
        onChange()
      },
    )
    .subscribe()

  return () => {
    void client.removeChannel(channel)
  }
}
