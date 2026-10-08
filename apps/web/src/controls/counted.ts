/**
 * "1 note", "3 notes": a count and the word for that many of it.
 *
 * Written by hand twenty-odd times across the interface, each a chance to
 * forget the singular (audit 2026-10-08). English only, like the rest of the
 * copy; an irregular plural is passed in.
 */
export function counted(count: number, one: string, many = `${one}s`): string {
  return `${String(count)} ${count === 1 ? one : many}`
}
