/**
 * A stored record as text somebody can keep, whatever it holds.
 *
 * The record came out of IndexedDB, which stores by structured clone — so it
 * may hold what JSON cannot: a BigInt, or an object that refers back to
 * itself. `JSON.stringify` throws on both, and the one thing a person can do
 * with a board this version cannot read is take a copy of it. So a value JSON
 * cannot spell is written as a marked stand-in (`{"$bigint": "…"}`, `"$cycle"`)
 * rather than the copy failing outright, and the caller is told, so it can
 * say that the copy is not byte for byte.
 */
export function copyOfRecord(raw: unknown): { readonly text: string; readonly exact: boolean } {
  try {
    return { text: JSON.stringify(raw, null, 2), exact: true }
  } catch {
    const seen = new WeakSet<object>()
    const text = JSON.stringify(
      raw,
      (_key, value: unknown) => {
        if (typeof value === 'bigint') return { $bigint: value.toString() }
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return '$cycle'
          seen.add(value)
        }
        return value
      },
      2,
    )
    return { text, exact: false }
  }
}
