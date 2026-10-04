import type { BoardConnection } from '@openframe/collab'

import type { FacilitationChannel } from '../runtime/facilitation.js'

/**
 * How often to ask the room the time again. Clocks drift slowly; a device that
 * slept is caught by the page coming back, below, not by this.
 */
const RESYNC_MS = 5 * 60_000

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

  return {
    now: () => connection.serverNow(),
    timer: () => connection.facilitation().timer,
    subscribe: (listener) => {
      // `onFacilitation` answers at once; a store subscriber wants to hear only of changes.
      let first = true
      const stopState = connection.onFacilitation(() => {
        if (first) first = false
        else listener()
      })
      const stopClock = connection.onClock(listener)
      return () => {
        stopState()
        stopClock()
      }
    },
    writeTimer: (timer) => {
      connection.writeTimer(timer)
    },
    dispose: () => {
      clearInterval(resync)
      document.removeEventListener('visibilitychange', onVisible)
    },
  }
}
