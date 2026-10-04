import type { SessionTimer } from '@openframe/core/facilitation'

/**
 * The session's shared state — its timer — as the interface sees it, whatever
 * board it is on (ADR 0017).
 *
 * Two implementations, chosen once by the composition root: a shared board's
 * lives in its room and runs on the room's clock; a local board's lives in this
 * browser and runs on this device's. The interface never asks which, so a
 * timer behaves identically on both — and a local board's survives a reload,
 * because a facilitator who refreshes mid-exercise must not lose the clock.
 *
 * Not a command and never undone (rule 3's one stated exception, ADR 0017):
 * the timer is the state of a meeting about the board, not part of the board.
 */
export interface FacilitationChannel {
  /** The time every timer on this board is measured against. */
  readonly now: () => number
  /**
   * Whether `now` can be trusted yet. A deadline written before it can is
   * written on the wrong clock, and nothing afterwards repairs it, so the
   * timer cannot be run until this is true.
   */
  readonly ready: () => boolean
  /** The timer, the same object until it changes (rule 9). `null` until somebody sets one. */
  readonly timer: () => SessionTimer | null
  /** Called when the timer changes, the clock it runs on is corrected, or it becomes ready. */
  readonly subscribe: (listener: () => void) => () => void
  /** Replaces the timer, for everyone who can see this board. */
  readonly writeTimer: (timer: SessionTimer) => void
}
