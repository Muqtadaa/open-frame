/**
 * The standard emoji, for reacting with something the bar does not offer.
 *
 * Loaded on demand: the library is a few hundred kilobytes of names, and most
 * reactions are the eight on the bar, so nobody pays for it until the picker
 * opens. `unicode-emoji-json` (MIT) is the Unicode list with CLDR names, in the
 * Unicode order and grouping people know from their phone's keyboard.
 */
export interface LibraryEmoji {
  readonly emoji: string
  readonly name: string
  readonly slug: string
}

export interface LibraryGroup {
  readonly name: string
  readonly emojis: readonly LibraryEmoji[]
}

let loading: Promise<readonly LibraryGroup[]> | null = null

export function loadEmojiLibrary(): Promise<readonly LibraryGroup[]> {
  loading ??= import('unicode-emoji-json/data-by-group.json').then((module) =>
    module.default.map((group) => ({
      name: group.name,
      emojis: group.emojis.map(({ emoji, name, slug }) => ({ emoji, name, slug })),
    })),
  )
  return loading
}

/** The emoji whose names contain every word typed, in library order. */
export function searchEmoji(
  groups: readonly LibraryGroup[],
  query: string,
): readonly LibraryEmoji[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  return groups.flatMap((group) =>
    group.emojis.filter((item) => words.every((word) => item.name.includes(word))),
  )
}
