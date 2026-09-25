import { IS_MAC } from './platform.js'

/**
 * A chord written once — `'Mod+Shift+G'` — as a label shows it.
 *
 * ONE notation per platform. The menu mixed them, "Ctrl+⇧G", a word for one
 * modifier and a Mac glyph for the next, which is neither platform's
 * convention and reads as a typo. A Mac gets its glyphs in its own order with
 * nothing between them (⇧⌘G); everywhere else gets words joined by +.
 */
/*
 * Keys named rather than typed where the character would be ambiguous in a
 * chord or in markup: Shift+Period is what a label shows as ">".
 */
const NAMED: Readonly<Record<string, string>> = { Period: '>', Comma: '<' }

export function formatKeys(chord: string, isMac: boolean = IS_MAC): string {
  const parts = chord.split('+')
  const named = parts.pop() ?? ''
  const key = NAMED[named] ?? named
  const has = (modifier: string): boolean => parts.includes(modifier)
  if (isMac) {
    return `${has('Alt') ? '⌥' : ''}${has('Shift') ? '⇧' : ''}${has('Mod') ? '⌘' : ''}${key}`
  }
  return [has('Mod') ? 'Ctrl' : '', has('Alt') ? 'Alt' : '', has('Shift') ? 'Shift' : '', key]
    .filter((part) => part !== '')
    .join('+')
}

/**
 * The same chord for `aria-keyshortcuts`, which wants key NAMES — `Control`,
 * `Meta` — so a screen reader can say the shortcut rather than read a glyph.
 */
export function ariaKeys(chord: string, isMac: boolean = IS_MAC): string {
  return chord
    .split('+')
    .map((part) =>
      part === 'Mod'
        ? isMac
          ? 'Meta'
          : 'Control'
        : part === 'Del'
          ? 'Delete'
          : (NAMED[part] ?? part),
    )
    .join('+')
}
