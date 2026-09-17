/**
 * Time, as a dependency.
 *
 * Injected rather than read from `Date.now()` so that command handlers,
 * migrations and persistence are deterministic under test. Every `createdAt`
 * in the system originates here.
 */
export interface Clock {
  now(): number
}

export const systemClock: Clock = { now: () => Date.now() }

/** A clock that advances only when you tell it to. For tests. */
export function fixedClock(startMs = 0, stepMs = 0): Clock {
  let current = startMs
  return {
    now() {
      const value = current
      current += stepMs
      return value
    },
  }
}
