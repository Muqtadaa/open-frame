/**
 * v1 → v2: a poll records who asked it, so only they close it. A poll saved
 * before that knew nobody, and keeps knowing nobody: `null`, which anyone
 * who can edit the board may close, as they always could.
 *
 * Local shapes, `unknown` in and out, per rule 6. Pure, forward-only, never
 * edited once shipped.
 */

type V1Data = Readonly<Record<string, unknown>>

export function addAsker(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data
  const v1 = data as V1Data
  if ('by' in v1) return data
  return { ...v1, by: null }
}
