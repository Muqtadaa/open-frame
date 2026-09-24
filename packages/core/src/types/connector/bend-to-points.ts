/**
 * v1 → v2: a connector's single `bend` becomes a list of held points.
 *
 * Declares its own local input and output shapes and operates on `unknown`,
 * per rule 6 and ADR 0008: importing today's `Bend` would make this migration
 * silently change meaning the next time that type changes. It is pure,
 * forward-only, and never edited once shipped.
 *
 * The v1 field was optional AND nullable — it was added to a shipped type
 * without a migration, which is only safe while an absent value and a null one
 * mean the same thing. Both mean "no bend", and both become an empty list.
 */

/** What v1 looked like: at most one bend, plus whatever else the type had. */
interface V1Data {
  readonly bend?: unknown
  readonly [key: string]: unknown
}

interface V1Bend {
  readonly along: number
  readonly across: number
}

function isBend(value: unknown): value is V1Bend {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { along?: unknown; across?: unknown }
  return Number.isFinite(candidate.along) && Number.isFinite(candidate.across)
}

export function bendToPoints(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data
  const { bend, ...rest } = data as V1Data

  if (bend === undefined || bend === null) return { ...rest, points: [] }

  /*
   * A `bend` that is not a bend is left exactly as it is rather than coerced
   * or dropped.
   *
   * It means the object was written by something this migration does not
   * understand — a newer build, a hand-edited file, a bug. Inventing a point
   * from it would call a guess a successful migration; leaving it lets
   * validation reject the object, which degrades that ONE connector to an
   * `unknown` and preserves its payload byte-for-byte. The board still opens.
   */
  if (!isBend(bend)) return data

  return { ...rest, points: [{ along: bend.along, across: bend.across }] }
}
