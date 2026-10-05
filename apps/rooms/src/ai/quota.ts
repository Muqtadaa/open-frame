import type { Reserved } from './handler.js'

/**
 * Daily AI runs, per person and for everybody: the policy, kept apart from the
 * Durable Object that holds the counts so it can be tested in Node.
 *
 * One object holds every count for a day, so a reservation is a single
 * read-and-write nobody can interleave with — the reason it is a Durable
 * Object rather than KV, whose writes land eventually and would let a burst
 * of requests all see the same count.
 */
export interface DayCounts {
  readonly day: string
  readonly everyone: number
  readonly people: Readonly<Record<string, number>>
}

export interface Limits {
  readonly person: number
  readonly everyone: number
}

/** The day a run counts against, in UTC so the limit resets at one moment everywhere. */
export const dayOf = (now: number): string => new Date(now).toISOString().slice(0, 10)

export function reserveRun(
  counts: DayCounts | undefined,
  day: string,
  userId: string,
  limits: Limits,
): { readonly counts: DayCounts; readonly result: Reserved } {
  // Yesterday's counts are gone the moment today's first request arrives.
  const today: DayCounts = counts?.day === day ? counts : { day, everyone: 0, people: {} }
  const mine = today.people[userId] ?? 0
  if (mine >= limits.person) return { counts: today, result: { ok: false, limit: 'person' } }
  if (today.everyone >= limits.everyone) {
    return { counts: today, result: { ok: false, limit: 'everyone' } }
  }
  return {
    counts: {
      day,
      everyone: today.everyone + 1,
      people: { ...today.people, [userId]: mine + 1 },
    },
    result: { ok: true, remaining: limits.person - mine - 1, day },
  }
}

/** A run that produced nothing usable, given back — never below zero, never to another day. */
export function refundRun(counts: DayCounts | undefined, day: string, userId: string): DayCounts {
  if (counts?.day !== day) return counts ?? { day, everyone: 0, people: {} }
  const mine = counts.people[userId] ?? 0
  if (mine === 0) return counts
  return {
    day,
    everyone: Math.max(0, counts.everyone - 1),
    people: { ...counts.people, [userId]: mine - 1 },
  }
}
