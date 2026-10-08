import { useEffect, useState } from 'react'

/**
 * The time to show, re-read every `every` milliseconds while `ticking`, and
 * not at all otherwise — a paused timer or stopped music has nothing to move.
 *
 * Read on every render as well, so a change from elsewhere never shows a
 * stale time. One hook: the timer and the music each had their own copy.
 */
export function useTick(now: () => number, ticking: boolean, every: number): number {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!ticking) return
    const id = setInterval(() => {
      setTick((tick) => tick + 1)
    }, every)
    return () => {
      clearInterval(id)
    }
  }, [ticking, every])
  return now()
}
