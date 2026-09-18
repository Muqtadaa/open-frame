import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The palette's WCAG 2.2 AA floor, checked against the REAL stylesheet.
 *
 * AA is a product commitment (PRODUCT.md), and a commitment nobody measures is
 * a wish. Parsing `styles.css` rather than restating the hex values here is the
 * whole point: a duplicated palette would drift, and the test would keep passing
 * against colours the app no longer uses.
 */
// Resolved from the package root, not `import.meta.url`: under jsdom that is an
// http URL, not a file one.
const CSS = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')

function token(name: string): string {
  const match = new RegExp(`--of-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(CSS)
  if (match?.[1] === undefined) throw new Error(`token --of-${name} is not defined as a hex colour`)
  return match[1]
}

function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (lighter + 0.05) / (darker + 0.05)
}

/** 1.4.3 Contrast (Minimum): text and images of text. */
const TEXT: readonly (readonly [string, string])[] = [
  ['ink', 'bg'],
  ['ink', 'page'],
  ['ink', 'panel'],
  ['ink-muted', 'panel'],
  ['ink-muted', 'bg'],
  ['accent', 'panel'],
  ['accent', 'accent-soft'],
  ['danger', 'panel'],
]

/** 1.4.11 Non-text Contrast: boundaries you must perceive to operate a control. */
const CONTROLS: readonly (readonly [string, string])[] = [
  ['control-border', 'panel'],
  ['control-border', 'page'],
  ['control-border', 'bg'],
  ['accent', 'page'],
]

describe('palette contrast', () => {
  it.each(TEXT)('%s on %s meets AA for text (4.5:1)', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(CONTROLS)('%s on %s meets AA for controls (3:1)', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(3)
  })

  /**
   * Every content colour is used as ink on its own surface — a sticky's text on
   * its body, a shape's stroke on its fill — so each pair carries real text.
   */
  it.each(['yellow', 'green', 'blue', 'red', 'violet', 'orange', 'gray'])(
    '%s ink on its own surface meets AA for text',
    (name) => {
      expect(contrast(token(`c-${name}`), token(`s-${name}`))).toBeGreaterThanOrEqual(4.5)
    },
  )

  /**
   * The quadrille is ground, not a control: it is deliberately BELOW the 3:1
   * floor. Asserting the ceiling stops a later "improve contrast" pass turning
   * the page rule into a cage the content has to fight.
   */
  it('keeps the page rule quiet enough to be ground', () => {
    expect(contrast(token('rule'), token('page'))).toBeLessThan(2)
    expect(contrast(token('rule-decade'), token('page'))).toBeLessThan(2.5)
    // ...but still visible. A rule nobody can see is not a rule.
    expect(contrast(token('rule-decade'), token('page'))).toBeGreaterThan(1.2)
  })

  /**
   * The world reserves ONE red for destructive and corrective meaning. When the
   * content red sat 8 units away from it in sRGB the reservation was defeated by
   * the palette itself: a red slip on the page read as a correction mark, and
   * the inspector offered that hue as an ordinary choice.
   */
  it('keeps the content red clear of the correction red', () => {
    const [cr, cg, cb] = channels(token('c-red'))
    const [dr, dg, db] = channels(token('danger'))
    expect(Math.hypot(cr - dr, cg - dg, cb - db)).toBeGreaterThan(30)
  })

  it('never uses pure black as ink', () => {
    expect(token('ink')).not.toBe('#000000')
    const [r, , b] = channels(token('ink'))
    // Real ink carries a cast; a neutral near-black is the untinted default.
    expect(Math.abs(b - r)).toBeGreaterThan(4)
  })
})
