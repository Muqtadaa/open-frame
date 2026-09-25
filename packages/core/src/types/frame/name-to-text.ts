/**
 * v1 → v2: a frame's title becomes rich text (ADR 0014).
 *
 * Local shapes, `unknown` in and out, per rule 6. Pure, forward-only, never
 * edited once shipped.
 */

interface V1Data {
  readonly name?: unknown
  readonly [key: string]: unknown
}

export function nameToText(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data
  const v1 = data as V1Data
  // A non-string is left for validation to refuse rather than coerced.
  if (typeof v1.name !== 'string') return data
  return { ...v1, name: [{ text: v1.name }] }
}
