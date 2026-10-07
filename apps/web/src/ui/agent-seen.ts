/**
 * Which agent changes this browser has already been shown, per board.
 *
 * Kept here rather than in the room: what you have looked at is yours, and a
 * change your colleague has read is still news to you. Capped, newest last,
 * because the log itself only keeps the latest changes. Storage can refuse —
 * a private window, a full quota — and then nothing is remembered, which is
 * the change staying new, never an error.
 */
const LIMIT = 200

const keyFor = (boardId: string): string => `openframe:agent-seen:${boardId}`

export function readSeen(boardId: string): ReadonlySet<string> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(keyFor(boardId)) ?? '[]')
    return new Set(
      Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [],
    )
  } catch {
    return new Set()
  }
}

export function writeSeen(boardId: string, seen: ReadonlySet<string>): void {
  try {
    localStorage.setItem(keyFor(boardId), JSON.stringify([...seen].slice(-LIMIT)))
  } catch {
    // Not remembered: the changes simply stay new in this browser.
  }
}
