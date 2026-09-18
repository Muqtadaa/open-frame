/**
 * v1 → v2 for every type whose `text` became a list of spans (ADR 0012).
 *
 * Declares its own local input and output shapes and operates on `unknown`,
 * per rule 6: importing today's `RichText` would make this migration silently
 * change meaning the next time that type changes. It is pure, forward-only,
 * and never edited once shipped.
 *
 * Shared by six types because the transform is identical for all of them. The
 * migrations themselves stay per-type, because that is what ADR 0008 requires
 * and because the next one will not be shared.
 */

/** What v1 looked like: a plain string under `text`, plus whatever else. */
interface V1Data {
  readonly text?: unknown
  readonly [key: string]: unknown
}

export function textToSpans(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data
  const v1 = data as V1Data

  /*
   * A non-string `text` is left exactly as it is rather than coerced.
   *
   * It means the document was written by something this migration does not
   * understand — a newer build, a hand-edited file, a bug. Wrapping
   * `String(value)` around it would turn "[object Object]" into a user's note
   * and call that a successful migration; leaving it lets validation reject the
   * object and the board quarantine it, which is recoverable.
   */
  if (typeof v1.text !== 'string') return data

  return { ...v1, text: [{ text: v1.text }] }
}
