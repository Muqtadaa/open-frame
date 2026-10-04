import type { BoardConnection } from '@openframe/collab'

import type { FacilitationChannel } from '../runtime/facilitation.js'

/**
 * How often to ask the room the time again. Clocks drift slowly; a device that
 * slept is caught by the page coming back, below, not by this.
 */
const RESYNC_MS = 5 * 60_000

/**
 * How long after connecting to wait for an answer before deciding the room is
 * too old to give one. The question goes out the moment the socket opens, so
 * a current room answers in one round trip; this only ever applies mid-way
 * through a rolling deploy, when the timer runs on this device's clock.
 */
const OLD_ROOM_MS = 5000

/**
 * A shared board's session timer: the room's state, on the room's clock.
 *
 * The clock is asked again every few minutes and whenever the page becomes
 * visible — a laptop that was closed may have slept through a correction to
 * its own clock, and the timer would otherwise be wrong by however much.
 */
export function roomFacilitation(
  connection: BoardConnection,
): FacilitationChannel & { readonly dispose: () => void } {
  const resync = setInterval(() => {
    connection.syncClock()
  }, RESYNC_MS)
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') connection.syncClock()
  }
  document.addEventListener('visibilitychange', onVisible)

  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }
  // `onFacilitation` answers at once; a store subscriber wants to hear only of changes.
  let first = true
  const stopState = connection.onFacilitation(() => {
    if (first) first = false
    else notify()
  })
  const stopClock = connection.onClock(notify)

  let gaveUp = false
  let waiting: ReturnType<typeof setTimeout> | null = null
  const stopStatus = connection.onStatus((status) => {
    if (status !== 'connected' || waiting !== null || gaveUp) return
    waiting = setTimeout(() => {
      if (connection.clockSynced) return
      gaveUp = true
      notify()
    }, OLD_ROOM_MS)
  })

  return {
    now: () => connection.serverNow(),
    ready: () => connection.clockSynced || gaveUp,
    timer: () => connection.facilitation().timer,
    music: () => connection.facilitation().music,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    writeTimer: (timer) => {
      connection.writeTimer(timer)
    },
    writeMusic: (music) => {
      connection.writeMusic(music)
    },
    dispose: () => {
      clearInterval(resync)
      if (waiting !== null) clearTimeout(waiting)
      document.removeEventListener('visibilitychange', onVisible)
      stopState()
      stopClock()
      stopStatus()
      listeners.clear()
    },
  }
}
