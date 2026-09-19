import type { BoardId } from '@openframe/core'

import { passwordUrl, unlockUrl } from './collab-config.js'

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
 * Takes the EDITOR key, which is the authority the room checks — the same one
 * that can destroy the board. Whoever holds the edit link can do this; the
 * interface only offers it on a board you own.
 *
 * Any token this browser holds is dropped either way, because the room mints a
 * new one on every change and the old one stops working the moment this
 * returns. Keeping it would mean the next visit presenting something stale.
 */
export async function setBoardPassword(
  boardId: BoardId,
  key: string,
  password: string | null,
): Promise<PasswordOutcome> {
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
