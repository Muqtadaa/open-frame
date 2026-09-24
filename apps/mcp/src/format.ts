import type { BoardDocument } from '@openframe/core'

import type { Account, BoardAccess } from './supabase/account.js'

/**
 * Everything this tool prints, as functions that return strings.
 *
 * Pure and separate from the command that prints them, for one reason: the
 * guard this stage has to hold is that **no token, key or session ever appears
 * in output**, and a guard about printing can only be tested if the printing
 * can be called. `format.test.ts` runs every one of these over a board whose
 * key is a known value and fails if the value comes back.
 */

export function signedInAs(account: Account): string {
  return `${account.displayName}${account.email === null ? '' : ` <${account.email}>`}`
}

export function whoami(account: Account | null): string {
  return account === null
    ? 'Not signed in. Run `login` first.'
    : `Signed in as ${signedInAs(account)}`
}

/**
 * The board list: what it is, what you may do with it, what it is called.
 *
 * Never the key. It is the whole of a link's authority, and a terminal is a
 * scrollback buffer, a screen share and a CI log.
 */
export function boardList(boards: readonly BoardAccess[]): string {
  if (boards.length === 0) return 'No boards on this account yet.'
  const widest = Math.max(...boards.map((board) => board.boardId.length))
  return boards
    .map((board) => `${board.boardId.padEnd(widest)}  ${board.role.padEnd(6)}  ${board.title}`)
    .join('\n')
}

/** What a peer found when it opened a board. */
export function boardSummary(document: BoardDocument, role: string): string {
  const counts = new Map<string, number>()
  for (const object of document.objects.values()) {
    counts.set(object.type, (counts.get(object.type) ?? 0) + 1)
  }
  const kinds = [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, count]) => `  ${type}: ${String(count)}`)

  const head = `${document.meta.title} — ${String(document.objects.size)} object(s), joined as ${role}`
  return kinds.length === 0 ? head : [head, ...kinds].join('\n')
}
