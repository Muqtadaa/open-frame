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
   * An association, not a location: the pin's own coordinates are what hold
   * it. So an object that is later deleted leaves the comment exactly where it
   * was put, and the interface says what it was attached to is gone.
   */
  readonly objectId: ObjectId | null
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

function readComment(row: unknown): BoardComment | null {
  if (typeof row !== 'object' || row === null) return null
  const r = row as Record<string, unknown>
  const id = r['id']
  const body = r['body']
  const authorId = r['author_id']
  if (typeof id !== 'string' || typeof body !== 'string' || typeof authorId !== 'string') {
    return null
  }
  const at = (key: string): number | null => {
    const value = r[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }
  const when = (key: string): number | null => {
    const value = r[key]
    if (typeof value !== 'string') return null
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return {
    id,
    parentId: typeof r['parent_id'] === 'string' ? r['parent_id'] : null,
    authorId,
    authorName: typeof r['author_name'] === 'string' ? r['author_name'] : 'Someone',
    authorHue: typeof r['author_hue'] === 'number' ? r['author_hue'] : 0,
    body,
    x: at('x'),
    y: at('y'),
    objectId: typeof r['object_id'] === 'string' ? (r['object_id'] as ObjectId) : null,
    resolvedAt: when('resolved_at'),
    createdAt: when('created_at') ?? 0,
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
    const r = row as Record<string, unknown>
    if (typeof r['user_id'] !== 'string') continue
    people.push({
      userId: r['user_id'],
      displayName: typeof r['display_name'] === 'string' ? r['display_name'] : 'Someone',
      hue: typeof r['hue'] === 'number' ? r['hue'] : 0,
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
    const r = row as Record<string, unknown>
    const commentId = r['comment_id']
    const boardId = r['board_id']
    if (typeof commentId !== 'string' || typeof boardId !== 'string') continue
    const created = typeof r['created_at'] === 'string' ? Date.parse(r['created_at']) : Number.NaN
    mentions.push({
      commentId,
      boardId: boardId as BoardId,
      boardTitle: typeof r['board_title'] === 'string' ? r['board_title'] : 'A board',
      authorName: typeof r['author_name'] === 'string' ? r['author_name'] : 'Someone',
      body: typeof r['body'] === 'string' ? r['body'] : '',
      createdAt: Number.isNaN(created) ? 0 : created,
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
