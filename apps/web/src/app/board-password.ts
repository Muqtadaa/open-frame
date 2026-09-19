import type { BoardId } from '@openframe/core'

import { ownerKeyUrl, passwordUrl, unlockUrl } from './collab-config.js'
import { listMyBoards, recordOwnerKey } from '../adapters/supabase/boards.js'

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
export async function recoverOwnerKey(boardId: BoardId): Promise<string | null> {
  const cached = heldOwnerKey(boardId)
  if (cached !== null) return cached

  let mine: Awaited<ReturnType<typeof listMyBoards>>
  try {
    mine = await listMyBoards()
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
 * Both halves or neither: a key the room minted and Supabase never recorded is
 * lost the moment this tab closes, and the board would adopt again next time —
 * except it cannot, because the room only mints once. So the room is asked
 * only after there is somewhere to put the answer, and a failure to record it
 * is reported rather than swallowed.
 */
async function adoptOwnerKey(boardId: BoardId, editorKey: string): Promise<string | null> {
  let response: Response
  try {
    response = await fetch(ownerKeyUrl(boardId), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: editorKey }),
    })
  } catch {
    return null
  }
  if (!response.ok) return null

  const body: unknown = await response.json().catch(() => null)
  const owner = (body as { owner?: unknown } | null)?.owner
  if (typeof owner !== 'string') return null

  if (!(await recordOwnerKey(boardId, owner))) return null
  rememberOwnerKey(boardId, owner)
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

export type UnlockOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

/**
 * Trades the password for the token, and remembers it.
 *
 * The key goes too: the room checks the link BEFORE the password, so that
 * somebody without the link learns nothing about whether a board is protected.
 */
export async function unlockBoard(
  boardId: BoardId,
  key: string | null,
  password: string,
): Promise<UnlockOutcome> {
  let response: Response
  try {
    response = await fetch(unlockUrl(boardId), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, password }),
    })
  } catch {
    return { ok: false, reason: 'The room could not be reached.' }
  }

  if (!response.ok) {
    // One message for every way of being refused. Saying "that link is wrong"
    // rather than "that password is wrong" tells somebody probing which half
    // of the guess to keep — the same reasoning the room applies.
    return { ok: false, reason: 'That is not the password.' }
  }

  const body: unknown = await response.json().catch(() => null)
  const token = (body as { token?: unknown } | null)?.token
  if (typeof token !== 'string') {
    return { ok: false, reason: 'The room did not answer with a token.' }
  }

  rememberToken(boardId, token)
  return { ok: true }
}

export type PasswordOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

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
  boardId: BoardId,
  keys: { readonly owner: string | null; readonly editor: string },
  password: string | null,
): Promise<PasswordOutcome> {
  const key = keys.owner ?? (await adoptOwnerKey(boardId, keys.editor))
  if (key === null) {
    return { ok: false, reason: 'This board could not be given an owner key.' }
  }

  let response: Response
  try {
    response = await fetch(passwordUrl(boardId), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, password }),
    })
  } catch {
    return { ok: false, reason: 'The room could not be reached.' }
  }

  forgetToken(boardId)

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const error = (body as { error?: unknown } | null)?.error
    return { ok: false, reason: typeof error === 'string' ? error : 'That could not be changed.' }
  }
  return { ok: true }
}
