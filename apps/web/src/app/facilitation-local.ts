import type { BoardId } from '@openframe/core'
import { readMusic, readTimer } from '@openframe/core/facilitation'

import type { FacilitationChannel } from '../runtime/facilitation.js'

/**
 * A local board's session timer and music: this device's clock, kept in this browser.
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
  const timerKey = `openframe:timer:${boardId}`
  const musicKey = `openframe:music:${boardId}`
  let timer = read(timerKey, readTimer)
  let music = read(musicKey, readMusic)
  const listeners = new Set<() => void>()
  const keep = (key: string, value: unknown): void => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Held in memory for this page; only a reload forgets it.
    }
    for (const listener of [...listeners]) listener()
  }

  return {
    now,
    // This device's clock is the one a local board's timer runs on.
    ready: () => true,
    timer: () => timer,
    music: () => music,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    writeTimer: (next) => {
      timer = next
      keep(timerKey, next)
    },
    writeMusic: (next) => {
      music = next
      keep(musicKey, next)
    },
  }
}

function read<T>(key: string, reader: (value: unknown) => T | null): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? null : reader(JSON.parse(raw))
  } catch {
    return null
  }
}
