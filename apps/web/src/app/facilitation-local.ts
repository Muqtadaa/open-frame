import type { BoardId } from '@openframe/core'
import { readTimer, type SessionTimer } from '@openframe/core/facilitation'

import type { FacilitationChannel } from '../runtime/facilitation.js'

/**
 * A local board's session timer: this device's clock, kept in this browser.
 *
 * Kept, not just held, because a facilitator who refreshes mid-exercise must
 * find the clock where they left it. Read through the same strict reader as a
 * room's — storage is just as able to hold something that is not a timer.
 *
 * Every read and write is wrapped: `localStorage` throws outright in a private
 * window or with storage blocked, and a timer that only lasts until a reload
 * is still a timer.
 */
export function localFacilitation(
  boardId: BoardId,
  // Read through a call rather than captured, so a page whose clock is
  // replaced — a test's — is believed.
  now: () => number = () => Date.now(),
): FacilitationChannel {
  const key = `openframe:timer:${boardId}`
  let timer = read(key)
  const listeners = new Set<() => void>()

  return {
    now,
    timer: () => timer,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    writeTimer: (next) => {
      timer = next
      try {
        window.localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Held in memory for this page; only a reload forgets it.
      }
      for (const listener of [...listeners]) listener()
    },
  }
}

function read(key: string): SessionTimer | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? null : readTimer(JSON.parse(raw))
  } catch {
    return null
  }
}
