/**
 * When a board's history takes a version, and which versions it keeps.
 *
 * Pure numbers, here rather than beside either store, for the reason the
 * upload policy is: a shared board's room and a local board's browser keep
 * history the same way, and two copies of these rules would drift the way the
 * two image limits once did. Only the RETENTION differs between them, and that
 * is passed in.
 *
 * Every time is milliseconds on whatever clock the caller keeps — the room's
 * own for a shared board, the device's for a local one. Nothing here compares
 * one clock with another.
 */

export const MINUTE_MS = 60_000
export const DAY_MS = 24 * 60 * MINUTE_MS

/**
 * How long editing must be quiet before it counts as settled.
 *
 * Long enough that a pause to think is not a version, short enough that
 * somebody who stops for coffee comes back to one.
 */
export const SETTLE_MS = 2 * MINUTE_MS

/**
 * The most often an automatic version is taken, and the longest continuous
 * editing goes without one. The same number does both jobs: a board edited
 * without a pause for an hour gets six versions, not one, and a board edited
 * in quick bursts does not get one per burst.
 */
export const MAX_INTERVAL_MS = 10 * MINUTE_MS

/** The two numbers above, as one value a caller can pass. */
export interface VersionTiming {
  readonly settleMs: number
  readonly intervalMs: number
}

export const VERSION_TIMING: VersionTiming = { settleMs: SETTLE_MS, intervalMs: MAX_INTERVAL_MS }

export type VersionKind = 'auto' | 'named'

/**
 * A version's id: the time it was taken, zero-padded so ids sort as times do,
 * and a random tail so two taken in the same millisecond do not collide. The
 * same shape in the room and in the browser, so one panel lists both.
 */
export const VERSION_ID = /^[0-9]{16}-[0-9a-f]{8}$/

export function versionId(at: number, random: () => number = Math.random): string {
  const tail = Math.floor(random() * 0x1_0000_0000)
    .toString(16)
    .padStart(8, '0')
  return `${String(at).padStart(16, '0')}-${tail}`
}

/** What thinning needs to know about a version — the rest is the store's. */
export interface VersionEntry {
  readonly id: string
  readonly at: number
  readonly kind: VersionKind
  readonly name?: string
}

/**
 * How long automatic versions are kept. Named versions are kept until
 * somebody deletes them, so they appear in neither number.
 *
 * - younger than `keepAllFor`: every one;
 * - from `keepAllFor` until `keepUntil`: the LAST of each UTC day;
 * - from `keepUntil`: none.
 *
 * Days are UTC so that the room, which has no time zone, and every browser
 * looking at it agree which versions share a day.
 */
export interface Retention {
  readonly keepAllFor: number
  readonly keepUntil: number
}

/** A shared board: everything for thirty days, then one a day to ninety. */
export const ROOM_RETENTION: Retention = { keepAllFor: 30 * DAY_MS, keepUntil: 90 * DAY_MS }

/**
 * A board kept only in this browser: everything for fourteen days, then none.
 * Shorter because it is the browser's storage, which the browser may take back
 * and the person never sees the size of.
 */
export const LOCAL_RETENTION: Retention = { keepAllFor: 14 * DAY_MS, keepUntil: 14 * DAY_MS }

export interface EditingState {
  /** When the first change not yet in any version was made, or `null` if there is none. */
  readonly dirtySince: number | null
  /** The most recent change. `null` falls back to `dirtySince`. */
  readonly lastEditAt: number | null
  /** When the last version of any kind was taken, or `null` for none yet. */
  readonly lastVersionAt: number | null
}

/**
 * When the next automatic version is due, or `null` when there is nothing to
 * keep.
 *
 * Settled (quiet for `SETTLE_MS`) or capped (`MAX_INTERVAL_MS` of unversioned
 * editing), whichever is first — and never sooner than `MAX_INTERVAL_MS` after
 * the last version.
 *
 * `timing` is the product's own unless a test needs minutes to be seconds.
 */
export function versionDueAt(
  state: EditingState,
  timing: VersionTiming = VERSION_TIMING,
): number | null {
  if (state.dirtySince === null) return null
  const lastEdit = state.lastEditAt ?? state.dirtySince
  const settled = lastEdit + timing.settleMs
  const capped = state.dirtySince + timing.intervalMs
  const earliest =
    state.lastVersionAt === null ? -Infinity : state.lastVersionAt + timing.intervalMs
  return Math.max(earliest, Math.min(settled, capped))
}

/** The ids of the versions retention no longer keeps, in no particular order. */
export function versionsToDrop(
  versions: readonly VersionEntry[],
  now: number,
  retention: Retention,
): string[] {
  const drop: string[] = []
  /** The newest automatic version of each day in the daily band. */
  const keptForDay = new Map<number, VersionEntry>()

  for (const version of versions) {
    if (version.kind !== 'auto') continue
    const age = now - version.at
    if (age < retention.keepAllFor) continue
    if (age >= retention.keepUntil) {
      drop.push(version.id)
      continue
    }
    const day = Math.floor(version.at / DAY_MS)
    const kept = keptForDay.get(day)
    if (kept === undefined) {
      keptForDay.set(day, version)
    } else if (version.at > kept.at) {
      drop.push(kept.id)
      keptForDay.set(day, version)
    } else {
      drop.push(version.id)
    }
  }
  return drop
}

/**
 * When thinning next has something to do, or `null` if it never will (no
 * automatic versions).
 *
 * The moment the soonest automatic version crosses into the next band — but
 * at most once a day after the last thinning, so a board with thousands of
 * versions is not woken for each one as it ages.
 */
export function nextThinningAt(
  versions: readonly VersionEntry[],
  now: number,
  lastThinnedAt: number | null,
  retention: Retention,
): number | null {
  let soonest = Infinity
  for (const version of versions) {
    if (version.kind !== 'auto') continue
    const age = now - version.at
    const boundary =
      age < retention.keepAllFor
        ? version.at + retention.keepAllFor
        : version.at + retention.keepUntil
    if (boundary < soonest) soonest = boundary
  }
  if (soonest === Infinity) return null
  const notBefore = lastThinnedAt === null ? now : Math.max(now, lastThinnedAt + DAY_MS)
  return Math.max(soonest, notBefore)
}
