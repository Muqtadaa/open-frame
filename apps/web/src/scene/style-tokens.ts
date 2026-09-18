import type { AlignToken, ColorToken, FontToken } from '@openframe/core'

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
