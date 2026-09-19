import type { BoardId } from '@openframe/core'

/**
 * Pins and last-opened for boards that have no account behind them.
 *
 * A signed-in person's pins live in the database and follow them between
 * browsers, which is most of what signing in is for. A local board cannot do
 * that — it exists in one browser and nowhere else — so its preferences live
 * beside it, in the only place that is true of.
 *
 * Every read and write is wrapped. `localStorage` throws outright in a private
 * window with site data blocked, and the front door refusing to render because
 * it could not remember which board was pinned would be an absurd way to fail.
 */

const PINS = 'openframe:pinned'
const OPENED = 'openframe:opened'

function read(key: string): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const out: Record<string, number> = {}
    // Narrowed rather than cast: this is storage a user can edit, and a string
    // where a number belongs would sort the list into nonsense.
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value)) out[id] = value
    }
    return out
  } catch {
    return {}
  }
}

function write(key: string, value: Record<string, number>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // A preference that could not be remembered is not worth an error.
  }
}

export function localPins(): ReadonlySet<string> {
  return new Set(Object.keys(read(PINS)))
}

export function setLocalPin(boardId: BoardId, pinned: boolean): void {
  const pins = read(PINS)
  if (pinned) pins[boardId] = Date.now()
  else delete pins[boardId]
  write(PINS, pins)
}

export function localOpenedAt(): Readonly<Record<string, number>> {
  return read(OPENED)
}

export function markLocalOpened(boardId: BoardId): void {
  const opened = read(OPENED)
  opened[boardId] = Date.now()
  write(OPENED, opened)
}

/** Forgets a deleted board, so its preferences do not outlive it. */
export function forgetLocalPrefs(boardId: BoardId): void {
  const pins = read(PINS)
  const opened = read(OPENED)
  delete pins[boardId]
  delete opened[boardId]
  write(PINS, pins)
  write(OPENED, opened)
}
