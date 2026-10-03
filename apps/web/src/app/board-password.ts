import type { BoardId } from '@openframe/core'

import type { RemoteBoard, RemoteBoardService, RoomService } from '../runtime/services.js'

/** What a password needs from the outside world: the room, and your account's boards. */
export interface PasswordDeps {
  readonly rooms: RoomService
  readonly remoteBoards: RemoteBoardService
}

/**
 * A board's optional password, from the browser's side.
 *
 * The room holds the only copy that decides anything — a verifier it can check
 * and never reverse. What lives here is the TOKEN it hands back, which is what
 * "remembered on this browser" actually means.
 */

/** Per board, because a password is per board. */
function tokenKey(boardId: BoardId): string {
  return `openframe:unlock:${boardId}`
}

/**
 * Where this browser keeps the owner key for a board it owns.
 *
 * Cached rather than fetched on every board open: the owner reaches their
 * board from the list, which already holds the key, so the common path costs
 * nothing. `recoverOwnerKey` covers the other one.
 */
function ownerKeyName(boardId: BoardId): string {
  return `openframe:owner:${boardId}`
}

export function heldOwnerKey(boardId: BoardId): string | null {
  try {
    return localStorage.getItem(ownerKeyName(boardId))
  } catch {
    return null
  }
}

export function rememberOwnerKey(boardId: BoardId, key: string): void {
  try {
    localStorage.setItem(ownerKeyName(boardId), key)
  } catch {
    // A browser that will not remember it asks the server again. Slower, not
    // broken.
  }
}

/**
 * Finds this board's owner key when the browser has none cached.
 *
 * The case this exists for: an owner opening a deep link on a machine that has
 * never loaded their board list. Without it they would be asked for the
 * password on their own board, which is the thing this whole change is for.
 *
 * Answers `null` for anybody who is not the owner, because `my_boards()`
 * returns the column to nobody else.
 */
export async function recoverOwnerKey(
  deps: PasswordDeps,
  boardId: BoardId,
): Promise<string | null> {
  const cached = heldOwnerKey(boardId)
  if (cached !== null) return cached

  let mine: readonly RemoteBoard[]
  try {
    mine = await deps.remoteBoards.listMine()
  } catch {
    return null
  }

  // Two absences collapsed into one, because they mean the same thing here:
  // this account does not own that board, or owns it and has no key yet.
  const ownerKey = mine.find((row) => row.boardId === boardId)?.ownerKey ?? null
  if (ownerKey === null) return null

  rememberOwnerKey(boardId, ownerKey)
  return ownerKey
}

/**
 * Gives a board claimed before owner keys existed one, and writes it down.
 *
 * The room mints an owner key ONCE and from then on gives it back only to
 * whoever already holds it — never to the edit link. So the key is kept in
 * this browser the moment it arrives, BEFORE the database is asked to record
 * it. Kept only after, a failed write would drop the board's one owner key on
 * the floor: nobody would hold it, the room would never mint another, and the
 * board could never again be deleted or given a password.
 *
 * A failed write is still reported, so the caller stops. The next attempt
 * finds the key held here and uses it instead of asking the room again.
 */
export async function adoptOwnerKey(
  deps: PasswordDeps,
  boardId: BoardId,
  editorKey: string,
): Promise<string | null> {
  const owner = await deps.rooms.adoptOwnerKey(boardId, editorKey)
  if (owner === null) return null

  rememberOwnerKey(boardId, owner)
  if (!(await deps.remoteBoards.recordOwnerKey(boardId, owner))) return null
  return owner
}

/**
 * The token this browser holds for a board, if it has unlocked one.
 *
 * Wrapped, because `localStorage` throws rather than returns in a browser
 * with site data blocked — and a board you cannot remember unlocking is a
 * board you type the password into again, not a crash.
 */
export function heldToken(boardId: BoardId): string | null {
  try {
    return localStorage.getItem(tokenKey(boardId))
  } catch {
    return null
  }
}

function rememberToken(boardId: BoardId, token: string): void {
  try {
    localStorage.setItem(tokenKey(boardId), token)
  } catch {
    // A browser that will not remember it asks again next time. That is a
    // worse experience, not a broken one.
  }
}

/**
 * A token that no longer opens the board.
 *
 * Dropped rather than kept, so the next visit asks for the password instead of
 * presenting something stale and being refused with no explanation.
 */
export function forgetToken(boardId: BoardId): void {
  try {
    localStorage.removeItem(tokenKey(boardId))
  } catch {
    // Nothing to do, and nothing that depends on it.
  }
}

export type UnlockOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: string }

/**
 * Trades the password for the token, and remembers it.
 *
 * The key goes too: the room checks the link BEFORE the password, so that
 * somebody without the link learns nothing about whether a board is protected.
 */
export async function unlockBoard(
  deps: PasswordDeps,
  boardId: BoardId,
  key: string | null,
  password: string,
): Promise<UnlockOutcome> {
  const unlocked = await deps.rooms.unlock(boardId, key, password)
  if (unlocked.ok) {
    rememberToken(boardId, unlocked.token)
    return { ok: true }
  }
  if (unlocked.reason === 'unreachable') {
    return {
      ok: false,
      reason: 'OpenFrame could not be reached. Check the connection and try again.',
    }
  }
  if (unlocked.reason === 'refused') {
    // One message for every way of being refused. Saying "that link is wrong"
    // rather than "that password is wrong" tells somebody probing which half
    // of the guess to keep — the same reasoning the room applies.
    return { ok: false, reason: 'That is not the password.' }
  }
  return { ok: false, reason: 'OpenFrame did not answer as expected. Try again in a moment.' }
}

export type PasswordOutcome =
  { readonly ok: true } | { readonly ok: false; readonly reason: string }

/**
 * Sets, changes or clears a board's password. `null` clears it.
 *
 * Takes the OWNER key, which is the authority the room checks — not the edit
 * link, which every editor holds. A board claimed before owner keys existed
 * adopts one here, once, on the edit key that is the strongest thing it has.
 *
 * Any token this browser holds is dropped either way, because the room mints a
 * new one on every change and the old one stops working the moment this
 * returns. Keeping it would mean the next visit presenting something stale.
 */
export async function setBoardPassword(
  deps: PasswordDeps,
  boardId: BoardId,
  keys: { readonly owner: string | null; readonly editor: string },
  password: string | null,
): Promise<PasswordOutcome> {
  const key = keys.owner ?? (await adoptOwnerKey(deps, boardId, keys.editor))
  if (key === null) {
    return { ok: false, reason: 'This board could not be given an owner key.' }
  }

  const changed = await deps.rooms.setPassword(boardId, key, password)
  if (!changed.ok && changed.reason === 'unreachable') {
    return {
      ok: false,
      reason: 'OpenFrame could not be reached. Check the connection and try again.',
    }
  }

  // The room answered, so any token held here is stale either way.
  forgetToken(boardId)

  if (!changed.ok) return { ok: false, reason: changed.message ?? 'That could not be changed.' }
  return { ok: true }
}

/**
 * The keys a board's OWNER holds, or `null` for anybody else.
 *
 * The edit key comes from the account rather than the address bar: an owner
 * who arrived on the view link would otherwise be handed an "edit link" that
 * only views. The view key makes the second link; the owner key authorizes
 * the password.
 * `my_boards()` returns both columns to the owner and to nobody else, so their
 * presence is also the answer to "is this mine" — asked once, when the room
 * chip mounts, rather than on every press.
 */
export async function ownedKeys(
  deps: PasswordDeps,
  boardId: BoardId,
): Promise<{
  readonly edit: string | null
  readonly view: string
  readonly owner: string | null
} | null> {
  let mine: readonly RemoteBoard[]
  try {
    mine = await deps.remoteBoards.listMine()
  } catch {
    return null
  }
  const row = mine.find((candidate) => candidate.boardId === boardId)
  const view = row?.viewKey ?? null
  if (row === undefined || view === null) return null
  if (row.ownerKey !== null) rememberOwnerKey(boardId, row.ownerKey)
  return { edit: row.accessKey, view, owner: row.ownerKey ?? heldOwnerKey(boardId) }
}
