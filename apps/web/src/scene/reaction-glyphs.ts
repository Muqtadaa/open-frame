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

const BY_EMOJI = new Map(REACTION_GLYPHS.map((glyph) => [glyph.emoji, glyph]))

/**
 * The key any emoji is stored under: its code points in hex, `u-1f600`. One
 * that is also on the bar keeps the bar's key, so 👍 from the library and 👍
 * from the bar are the same reaction, counted together.
 */
export function emojiKey(emoji: string): string {
  const onBar = BY_EMOJI.get(emoji)
  if (onBar !== undefined) return onBar.key
  return `u-${[...emoji].map((char) => (char.codePointAt(0) ?? 0).toString(16)).join('-')}`
}

/** The emoji a code-point key stands for, or null if it is not one. */
function fromCodePoints(key: string): string | null {
  if (!key.startsWith('u-')) return null
  const points = key
    .slice(2)
    .split('-')
    .map((hex) => Number.parseInt(hex, 16))
  if (points.some((point) => !Number.isInteger(point) || point < 0 || point > 0x10ffff)) return null
  return String.fromCodePoint(...points)
}

export function glyphFor(key: string): ReactionGlyph {
  const onBar = BY_KEY.get(key)
  if (onBar !== undefined) return onBar
  const emoji = fromCodePoints(key)
  // An emoji from the library is its own name: assistive technology reads an
  // emoji aloud by its Unicode name already.
  if (emoji !== null) return { key, emoji, label: emoji }
  return { key, emoji: '?', label: 'A reaction this version does not know' }
}

/** Where a glyph sits in the palette, so chips keep one order everywhere. */
export function glyphOrder(key: string): number {
  const index = REACTION_GLYPHS.findIndex((glyph) => glyph.key === key)
  return index === -1 ? REACTION_GLYPHS.length : index
}
