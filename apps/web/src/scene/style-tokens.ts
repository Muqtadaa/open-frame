import type { AlignToken, ColorToken, DashToken, FontToken } from '@openframe/core'

/**
 * The one place design tokens become CSS values.
 *
 * Documents store token NAMES, never colours, so this mapping is what makes
 * theming possible later without rewriting a single board. Every view reads
 * from here rather than hard-coding a hex value.
 */
export const COLOR_VARS: Record<ColorToken, string> = {
  yellow: 'var(--of-c-yellow)',
  green: 'var(--of-c-green)',
  blue: 'var(--of-c-blue)',
  red: 'var(--of-c-red)',
  violet: 'var(--of-c-violet)',
  orange: 'var(--of-c-orange)',
  gray: 'var(--of-c-gray)',
}

export const SURFACE_VARS: Record<ColorToken, string> = {
  yellow: 'var(--of-s-yellow)',
  green: 'var(--of-s-green)',
  blue: 'var(--of-s-blue)',
  red: 'var(--of-s-red)',
  violet: 'var(--of-s-violet)',
  orange: 'var(--of-s-orange)',
  gray: 'var(--of-s-gray)',
}

/**
 * The ink of an object's text, or `undefined` to inherit the board's own.
 *
 * `undefined` rather than a default token on purpose: a note whose text nobody
 * has coloured should read as the board reads, and pinning it to `gray` here
 * would freeze today's ink into every object the moment a theme changed it —
 * `inherit` is not a value CSS can be handed, so the property goes unset.
 */
export function inkColor(token: ColorToken | undefined): string | undefined {
  return token === undefined ? undefined : COLOR_VARS[token]
}

export function fontFamily(token: FontToken | undefined): string {
  switch (token) {
    case 'serif':
      return 'ui-serif, Georgia, serif'
    case 'mono':
      return 'ui-monospace, SFMono-Regular, Menlo, monospace'
    default:
      return 'inherit'
  }
}

export function textAlign(token: AlignToken | undefined): 'left' | 'center' | 'right' {
  return token === 'center' ? 'center' : token === 'end' ? 'right' : 'left'
}

/**
 * The same token as a flex main-axis alignment.
 *
 * A shape's label is centred in its inset box by a flex container, and a flex
 * container sizes its text to the content and then places it — so `text-align`
 * on the inside had nothing to align within, and every label stayed centred
 * whatever the user picked. Any container that CENTRES its text has to honour
 * the token twice: once for where the text block sits, once for how its lines
 * sit within it.
 */
export function justifyAlign(token: AlignToken | undefined): 'flex-start' | 'center' | 'flex-end' {
  return token === 'center' ? 'center' : token === 'end' ? 'flex-end' : 'flex-start'
}

/**
 * A dash pattern in units of the line's own width, so it reads the same at
 * every weight.
 *
 * A fixed "4 3" looks dashed on a thin line and nearly solid on a thick one;
 * scaling by stroke width keeps a dashed connector recognisably dashed
 * whatever weight the board is using. `undefined` means solid — an explicit
 * pattern for "no pattern" would have to be excluded again everywhere.
 */
export function dashArray(token: DashToken | undefined, width: number): string | undefined {
  if (token === 'dashed') return `${String(width * 3)} ${String(width * 2)}`
  // Dotted needs a round cap to be dots rather than very short dashes; the
  // zero-length segment is what a round cap turns into a circle.
  if (token === 'dotted') return `0 ${String(width * 2)}`
  return undefined
}
