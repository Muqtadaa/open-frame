/**
 * What a person calls an object's type.
 *
 * Type ids are written for the registry — `journey-stage`, `evidence` — and
 * the record panel used to show them as its subject, in the smallest, faintest
 * text it had. The panel's head is the one place the product's thesis is
 * visible (a note and a piece of evidence are the same thing with a different
 * payload), so it names the thing in words.
 *
 * Derived rather than declared: every type would otherwise have to state a
 * label, and adding a required field to every definition is a breaking change
 * this does not yet justify. A type whose id does not read as a noun is the
 * case that would.
 */
export function typeNoun(type: string): string {
  return type.replace(/[-_]+/g, ' ').trim()
}

/** A heading: the noun with its first letter raised. */
export function typeTitle(type: string): string {
  const noun = typeNoun(type)
  return noun.charAt(0).toUpperCase() + noun.slice(1)
}

/**
 * What a mixed selection is made of — "sticky · shape", "sticky ×3 · shape" —
 * in the order the types were first met, so it reads like the selection.
 */
export function selectionMakeup(types: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const type of types) counts.set(type, (counts.get(type) ?? 0) + 1)
  return [...counts]
    .map(([type, count]) => (count === 1 ? typeNoun(type) : `${typeNoun(type)} ×${String(count)}`))
    .join(' · ')
}

/**
 * Words for a type that its id does not give: "sticky" is what the code calls
 * a sticky note, and nobody counts "2 sticky".
 */
const SPOKEN: Readonly<Record<string, string>> = { sticky: 'sticky note' }

/** Nouns a person does not count with an s: "3 evidence", as "3 pieces of". */
const UNCOUNTED = new Set(['evidence'])

/** How many of a type, as said: "1 frame", "2 sticky notes", "3 evidence". */
export function countOfType(type: string, count: number): string {
  const noun = SPOKEN[type] ?? typeNoun(type)
  if (count === 1 || UNCOUNTED.has(noun)) return `${String(count)} ${noun}`
  const plural = /[^aeiou]y$/.test(noun)
    ? `${noun.slice(0, -1)}ies`
    : /(s|x|ch|sh)$/.test(noun)
      ? `${noun}es`
      : `${noun}s`
  return `${String(count)} ${plural}`
}
