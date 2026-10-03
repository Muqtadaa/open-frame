/**
 * The reactions on offer, and how each looks.
 *
 * A reaction stores a KEY, never the emoji: how a key looks is the interface's
 * business and can change, and a key this build has not met is still a
 * reaction somebody left — counted, and shown as a question mark rather than
 * dropped.
 *
 * Eight, because the bar shows them all at once. What a team says in a
 * workshop is mostly agreement, enthusiasm and doubt; this covers those
 * without becoming a picker.
 */
export interface ReactionGlyph {
  readonly key: string
  readonly emoji: string
  /** What it means, said out loud — for the button's name and the tooltip. */
  readonly label: string
}

export const REACTION_GLYPHS: readonly ReactionGlyph[] = [
  { key: 'plus-one', emoji: '👍', label: 'Agree' },
  { key: 'heart', emoji: '❤️', label: 'Love it' },
  { key: 'party', emoji: '🎉', label: 'Celebrate' },
  { key: 'idea', emoji: '💡', label: 'Good idea' },
  { key: 'fire', emoji: '🔥', label: 'Important' },
  { key: 'eyes', emoji: '👀', label: 'Looking into it' },
  { key: 'question', emoji: '❓', label: 'Question' },
  { key: 'check', emoji: '✅', label: 'Done' },
]

const BY_KEY = new Map(REACTION_GLYPHS.map((glyph) => [glyph.key, glyph]))

export function glyphFor(key: string): ReactionGlyph {
  return BY_KEY.get(key) ?? { key, emoji: '?', label: 'A reaction this version does not know' }
}

/** Where a glyph sits in the palette, so chips keep one order everywhere. */
export function glyphOrder(key: string): number {
  const index = REACTION_GLYPHS.findIndex((glyph) => glyph.key === key)
  return index === -1 ? REACTION_GLYPHS.length : index
}
