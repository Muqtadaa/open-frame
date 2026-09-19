import { asBoardId, type BoardId } from '@openframe/core'

import { supabaseClient } from './client.js'

/**
 * Boards that follow you between browsers.
 *
 * Everything here goes through a database function rather than a table read,
 * and that is not indirection for its own sake: a board's access keys are
 * revoked at the COLUMN level, so no client can select them. `my_boards()` is
 * the only door, and it hands back the one key your role entitles you to.
 *
 * Every failure is an empty list or a `false`, never a throw. A board opens
 * and edits offline — PRODUCT.md's fourth principle — so a database that
 * cannot be reached must degrade to "no remote boards", never to a broken
 * front door. What it costs is the LIST, not the boards.
 */

export interface RemoteBoard {
  readonly boardId: BoardId
  readonly title: string
  /** What this person may do with it, as the database computed it. */
  readonly role: 'owner' | 'editor' | 'viewer'
  /** The key that opens it for that role. `null` for a board shared before roles. */
  readonly accessKey: string | null
  /**
   * The VIEW-ONLY key, for a board you own and nobody else's.
   *
   * An owner already holds the editor key, which is strictly more powerful, so
   * handing them both leaks nothing — and without it the view-only link was
   * visible once, in the panel that appears when a board is shared, and
   * unrecoverable afterwards.
   */
  readonly viewKey: string | null
  readonly updatedAt: number
  /** Whether YOU pinned it. Nobody else's pin is visible, or any of their business. */
  readonly pinned: boolean
  /**
   * When YOU last opened it, which is what the list is ordered by.
   *
   * Not `updatedAt`: that is when the board last CHANGED, which on a shared
   * board is somebody else's typing — so ordering by it let a collaborator
   * working at midnight rearrange your list while you slept.
   */
  readonly openedAt: number
}

const ROLES = new Set(['owner', 'editor', 'viewer'])
const BOARD_ID = /^brd_[A-Za-z0-9]{8,48}$/
const ACCESS_KEY = /^[0-9a-f]{32}$/

/**
 * Narrowed at the boundary, because this is one.
 *
 * The rows come from a service over the network. A row whose shape this
 * version does not recognise is dropped rather than rendered — a board list is
 * not worth a blank screen, and `undefined.title` in a map callback is exactly
 * how one happens.
 */
function readBoard(row: unknown): RemoteBoard | null {
  if (typeof row !== 'object' || row === null) return null
  /*
   * Named as a shape rather than indexed, so the column names appear once and
   * the compiler carries them. Every field is `unknown` — that is the point:
   * this is what arrived, not what was promised.
   */
  const {
    id,
    title,
    role,
    access_key: key,
    updated_at: updated,
    pinned,
    opened_at: opened,
    view_key: viewKey,
  } = row as {
    id?: unknown
    title?: unknown
    role?: unknown
    access_key?: unknown
    updated_at?: unknown
    pinned?: unknown
    opened_at?: unknown
    view_key?: unknown
  }

  if (typeof id !== 'string' || !BOARD_ID.test(id)) return null
  if (typeof title !== 'string') return null
  if (typeof role !== 'string' || !ROLES.has(role)) return null

  const at = typeof updated === 'string' ? Date.parse(updated) : Number.NaN
  const seen = typeof opened === 'string' ? Date.parse(opened) : Number.NaN
  const updatedAt = Number.isFinite(at) ? at : 0

  return {
    boardId: asBoardId(id),
    title,
    role: role as RemoteBoard['role'],
    accessKey: typeof key === 'string' && ACCESS_KEY.test(key) ? key : null,
    viewKey: typeof viewKey === 'string' && ACCESS_KEY.test(viewKey) ? viewKey : null,
    updatedAt,
    // Anything but a true is not pinned. A row from a version that does not
    // send the column must not put a board at the top of the list.
    pinned: pinned === true,
    // Falls back to when the board last changed, which is what the database
    // does too — a board you have never opened should not sink out of sight.
    openedAt: Number.isFinite(seen) ? seen : updatedAt,
  }
}

export async function listMyBoards(): Promise<readonly RemoteBoard[]> {
  const client = supabaseClient()
  if (client === null) return []

  /*
   * Typed as `unknown` at the call, not by trusting a generated row type. The
   * client's own signature for an arbitrary RPC is `any`, and `any` here would
   * let every check below be optimised away by a reader's confidence rather
   * than by the compiler.
   */
  const response = (await client.rpc('my_boards')) as {
    data: unknown
    error: unknown
  }
  if (response.error !== null || !Array.isArray(response.data)) return []

  const boards: RemoteBoard[] = []
  for (const row of response.data as readonly unknown[]) {
    const board = readBoard(row)
    if (board !== null) boards.push(board)
  }
  return boards
}

/**
 * Records a board somebody has just shared, so it appears in their list.
 *
 * Best effort, and deliberately so: the board and its links already exist and
 * work the moment the room is claimed. Failing here costs a row in a list, and
 * refusing to share over it would trade the thing that works for the thing
 * that is convenient.
 */
export async function recordSharedBoard(board: {
  readonly boardId: BoardId
  readonly title: string
  readonly editorKey: string
  readonly viewerKey: string
}): Promise<boolean> {
  const client = supabaseClient()
  if (client === null) return false

  const response = (await client.rpc('record_shared_board', {
    p_id: board.boardId,
    p_title: board.title,
    p_editor_key: board.editorKey,
    p_viewer_key: board.viewerKey,
  })) as { error: unknown }
  return response.error === null
}

/**
 * Redeems a link for membership, so a board somebody shared reaches your list.
 *
 * Until this existed, "shared with me" was not merely unbuilt, it was
 * impossible: `board_members` has an insert policy saying only a board's owner
 * adds members, so a person arriving on a link could not record themselves and
 * the owner had nothing to record them WITH. Opening a board made you a guest
 * in the room and nothing in the database.
 *
 * This grants nothing. Whoever holds the key can already open the board — the
 * function writes down that they can, and the database decides which role the
 * key is worth. A key that opens nothing and a board that does not exist come
 * back the same way, which is what stops this being a way to ask which board
 * ids are real.
 */
export async function joinBoard(
  boardId: BoardId,
  key: string,
): Promise<RemoteBoard['role'] | null> {
  const client = supabaseClient()
  if (client === null) return null

  const response = (await client.rpc('join_board', { p_id: boardId, p_key: key })) as {
    data: unknown
    error: unknown
  }
  if (response.error !== null) return null
  // Narrowed like every other row from this service: what came back, not what
  // was promised.
  return typeof response.data === 'string' && ROLES.has(response.data)
    ? (response.data as RemoteBoard['role'])
    : null
}

/**
 * Pinning, and the order the list is read in.
 *
 * Both are best effort and neither throws. They are preferences about how a
 * list is arranged; nothing about the board itself depends on them, and a
 * database that cannot be reached must cost an ordering rather than the front
 * door.
 */
export async function setBoardPinned(boardId: BoardId, pinned: boolean): Promise<boolean> {
  const client = supabaseClient()
  if (client === null) return false

  const response = (await client.rpc('set_board_pinned', {
    p_id: boardId,
    p_pinned: pinned,
  })) as { error: unknown }
  return response.error === null
}

/**
 * Records that you opened a board.
 *
 * Fired on arrival and never awaited by anything the person is waiting for:
 * the board is already open by then, and a slow round trip must not hold it up.
 */
export async function touchBoardOpened(boardId: BoardId): Promise<void> {
  const client = supabaseClient()
  if (client === null) return
  await client.rpc('touch_board_opened', { p_id: boardId })
}

/**
 * Deleting a board, and leaving one: two verbs that look alike and are not.
 *
 * Delete removes the board from everybody and only its owner may do it. Leave
 * removes YOU from a board that stays exactly as it was. An interface that
 * offered one control for both would eventually destroy somebody's work on
 * behalf of a person who meant to tidy their own list.
 *
 * Neither touches the room. Destroying the Durable Object's storage is a
 * separate call against the Worker, made with the editor key, because that is
 * the credential the room understands and this database is not where it is
 * spent.
 */
export async function deleteRemoteBoard(boardId: BoardId): Promise<boolean> {
  const client = supabaseClient()
  if (client === null) return false

  const response = (await client.rpc('delete_board', { p_id: boardId })) as {
    data: unknown
    error: unknown
  }
  return response.error === null && response.data === true
}

export async function leaveRemoteBoard(boardId: BoardId): Promise<boolean> {
  const client = supabaseClient()
  if (client === null) return false

  const response = (await client.rpc('leave_board', { p_id: boardId })) as {
    data: unknown
    error: unknown
  }
  return response.error === null && response.data === true
}

/**
 * Keeps the listed name in step with the board's own.
 *
 * The title in the list is a COPY — the real one lives in the document, where
 * only the room and a browser holding it can see it. So a rename has to say so
 * here too, and the database refuses it from anyone but the owner.
 */
export async function renameRemoteBoard(boardId: BoardId, title: string): Promise<boolean> {
  const client = supabaseClient()
  if (client === null) return false

  const response = (await client.rpc('rename_board', {
    p_id: boardId,
    p_title: title,
  })) as { error: unknown }
  return response.error === null
}
