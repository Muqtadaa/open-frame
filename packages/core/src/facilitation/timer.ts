import { z } from 'zod'

/**
 * The session timer: one countdown a facilitator runs for everybody at the
 * board (ADR 0017).
 *
 * It is NOT board content. It is not undone, not copied, not exported and not
 * part of `BoardDocument` — it is the state of a meeting about the board. So it
 * lives beside the document rather than in it, and these rules live here so
 * the browser, a local board and any later peer apply the same ones.
 *
 * Every time is the ROOM's clock (`serverNow`), never a device's own: two
 * laptops whose clocks are a minute apart must still agree to the second on
 * what is left. That is also why "done" is never stored — it is a fact about
 * the clock, and a stored one would be wrong on every device that read it a
 * moment late.
 */

export const TIMER_VERSION = 1
/** Long enough for a workshop; short enough that a typo of an extra zero is caught. */
export const MAX_TIMER_MS = 4 * 60 * 60 * 1000
export const MIN_TIMER_MS = 1000
export const DEFAULT_TIMER_MS = 5 * 60 * 1000
const MINUTE = 60_000

export type TimerStatus = 'idle' | 'running' | 'paused'

export interface SessionTimer {
  readonly v: typeof TIMER_VERSION
  readonly status: TimerStatus
  /** What the timer was set to, and what a reset goes back to. */
  readonly durationMs: number
  /** When a running timer reaches zero, on the room's clock. `null` unless running. */
  readonly endsAt: number | null
  /** What is left while idle or paused. For a running timer, what was left when it started. */
  readonly remainingMs: number
  /**
   * Which run this is. Each start — and each minute added to a finished
   * timer — is a new run, so a finish is announced exactly once per run on
   * every device, however many times each one re-renders past zero.
   */
  readonly run: number
  /** Who last touched it, as a name to show. */
  readonly by: string | null
  /** When they did, on the room's clock. For showing, never for deciding. */
  readonly at: number
}

const duration = z.number().finite().min(0).max(MAX_TIMER_MS)
const time = z.number().finite()

const TimerSchema = z
  .strictObject({
    v: z.literal(TIMER_VERSION),
    status: z.enum(['idle', 'running', 'paused']),
    durationMs: duration,
    endsAt: time.nullable(),
    remainingMs: duration,
    run: z.number().int().min(0),
    by: z.string().max(200).nullable(),
    at: time,
  })
  .refine((timer) => (timer.status === 'running') === (timer.endsAt !== null))

/**
 * A timer as this client can use it, or `null`.
 *
 * Anybody with an edit link can write the record, so it is arbitrary JSON
 * until shown otherwise (rule 8). Strict, so a field this version does not
 * know is refused rather than silently dropped and written back without it.
 */
export function readTimer(value: unknown): SessionTimer | null {
  const parsed = TimerSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function idleTimer(durationMs: number = DEFAULT_TIMER_MS): SessionTimer {
  const ms = clampDuration(durationMs)
  return {
    v: TIMER_VERSION,
    status: 'idle',
    durationMs: ms,
    endsAt: null,
    remainingMs: ms,
    run: 0,
    by: null,
    at: 0,
  }
}

/** What is left, never below zero. */
export function remainingOf(timer: SessionTimer, now: number): number {
  if (timer.status !== 'running' || timer.endsAt === null) return timer.remainingMs
  return Math.min(MAX_TIMER_MS, Math.max(0, timer.endsAt - now))
}

export function isDone(timer: SessionTimer, now: number): boolean {
  return timer.status === 'running' && timer.endsAt !== null && now >= timer.endsAt
}

/** Chooses the duration of a timer not yet started. Any other timer is left alone. */
export function setDuration(
  timer: SessionTimer,
  durationMs: number,
  now: number,
  by: string | null,
): SessionTimer {
  if (timer.status !== 'idle') return timer
  const ms = clampDuration(durationMs)
  return { ...timer, durationMs: ms, remainingMs: ms, by, at: now }
}

export function startTimer(timer: SessionTimer, now: number, by: string | null): SessionTimer {
  if (timer.status !== 'idle') return timer
  return {
    ...timer,
    status: 'running',
    endsAt: now + timer.remainingMs,
    run: timer.run + 1,
    by,
    at: now,
  }
}

export function pauseTimer(timer: SessionTimer, now: number, by: string | null): SessionTimer {
  // A finished timer has nothing to hold; pausing it at zero would only hide that it ended.
  if (timer.status !== 'running' || isDone(timer, now)) return timer
  return {
    ...timer,
    status: 'paused',
    endsAt: null,
    remainingMs: remainingOf(timer, now),
    by,
    at: now,
  }
}

export function resumeTimer(timer: SessionTimer, now: number, by: string | null): SessionTimer {
  if (timer.status !== 'paused') return timer
  return { ...timer, status: 'running', endsAt: now + timer.remainingMs, by, at: now }
}

export function resetTimer(timer: SessionTimer, now: number, by: string | null): SessionTimer {
  return {
    ...timer,
    status: 'idle',
    endsAt: null,
    remainingMs: timer.durationMs,
    by,
    at: now,
  }
}

/**
 * One more minute, whatever state it is in. A finished timer restarts with a
 * minute on it — that is what "one more minute" means once time is up — and
 * counts as a new run, so its own finish is announced too.
 */
export function addMinute(timer: SessionTimer, now: number, by: string | null): SessionTimer {
  switch (timer.status) {
    case 'idle': {
      const ms = clampDuration(timer.durationMs + MINUTE)
      return { ...timer, durationMs: ms, remainingMs: ms, by, at: now }
    }
    case 'paused':
      return { ...timer, remainingMs: clampDuration(timer.remainingMs + MINUTE), by, at: now }
    case 'running': {
      if (isDone(timer, now)) {
        return {
          ...timer,
          endsAt: now + MINUTE,
          remainingMs: MINUTE,
          run: timer.run + 1,
          by,
          at: now,
        }
      }
      const left = clampDuration(remainingOf(timer, now) + MINUTE)
      return { ...timer, endsAt: now + left, by, at: now }
    }
  }
}

function clampDuration(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_TIMER_MS
  return Math.min(MAX_TIMER_MS, Math.max(MIN_TIMER_MS, Math.round(ms / 1000) * 1000))
}
