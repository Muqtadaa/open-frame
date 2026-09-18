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

/**
 * Colour lives on `:root` and nowhere else.
 *
 * The redesign changed the accent and left `.of-marquee` painting the OLD one as
 * an `rgb()` literal, and the notice banner kept a cream-on-tan pair that the
 * world's own header bans — both invisible because a literal answers to nothing.
 * Every value the app paints must come from a token, so changing a token changes
 * the app.
 */
describe('no colour literals outside the token block', () => {
  /** `.of-dev__*` is development instrumentation, stripped from production. */
  const DEV_ONLY = /\.of-dev__[^{]*\{[^}]*\}/g

  it('defines every colour as a token', () => {
    const withoutRoot = CSS.replace(/:root[^{]*\{[^}]*\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(DEV_ONLY, '')

    const literals = withoutRoot.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) ?? []
    expect(literals).toEqual([])
  })
})

/**
 * The record panel's columns have to add up.
 *
 * Its width was chosen so all seven colour swatches sit on ONE row, and the
 * swatches live in the control column — so the label column is spending the
 * same budget. Widening labels (which had to happen: they come from the
 * registry now, and "participant" was being clipped to "participa") silently
 * takes space from the swatches, and a wrapped 5 + 2 swatch row reads as an
 * accident rather than a grid.
 *
 * The numbers live in two files — the panel's width in `Inspector.tsx`, the
 * columns in the stylesheet — so nothing but arithmetic connects them. This is
 * that arithmetic, run on every build.
 */
describe('the record panel fits what it promises to show', () => {
  const px = (pattern: RegExp): number => {
    const match = pattern.exec(CSS)
    const value = match?.[1]
    if (value === undefined) throw new Error(`No match for ${String(pattern)}`)
    return Number(value)
  }

  it('leaves room for seven swatches on one row', () => {
    const inspector = readFileSync(resolve(process.cwd(), 'src/ui/Inspector.tsx'), 'utf8')
    const widthMatch = /const PANEL_WIDTH = (\d+)/.exec(inspector)
    expect(widthMatch?.[1]).toBeDefined()
    const panelWidth = Number(widthMatch?.[1])

    const labelColumn = px(/\.of-field \{[^}]*grid-template-columns:\s*(\d+)px/)
    const columnGap = px(/\.of-field \{[^}]*\n\s*gap:\s*(\d+)px/)
    const swatch = px(/\.of-swatch \{[^}]*\n\s*width:\s*(\d+)px/)
    const swatchGap = px(/\.of-swatches \{[^}]*gap:\s*(\d+)px/)
    // `padding: 9px 10px 11px` — the horizontal value, taken from both sides.
    const sidePadding = px(/\.of-inspector \{[^}]*padding:\s*\d+px (\d+)px/)
    // The panel's own 1px border, both sides.
    const border = 2

    const control = panelWidth - border - sidePadding * 2 - labelColumn - columnGap
    const swatchRow = swatch * 7 + swatchGap * 6

    expect(swatchRow).toBeLessThanOrEqual(control)
  })
})

/**
 * The stylesheet has to PARSE.
 *
 * This file is only minified by the production build, so a structurally broken
 * stylesheet passed every test, ran fine in dev and e2e, and failed in Vercel —
 * which is the slowest possible place to find out. It happened: resolving a
 * merge by deleting conflict-marker lines ate a closing brace and the opening
 * of the next comment, joining a rule to a comment body.
 *
 * Not a full CSS parser — just the structure that mechanical editing breaks.
 */
describe('the stylesheet is well formed', () => {
  /** Comments first: a brace inside one is text, not structure. */
  const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '')

  it('has no unterminated or stray comment markers', () => {
    expect(CSS.split('/*').length, 'unbalanced comment markers').toBe(CSS.split('*/').length)
    /*
     * A comment body line left outside any comment is the exact shape of the
     * bug. `* { … }` is the universal selector, not a comment body, so a brace
     * on the line excludes it.
     */
    for (const [index, line] of withoutComments.split('\n').entries()) {
      const loose = /^\s*\*\s/.test(line) && !line.includes('{')
      expect(loose, `line ${String(index + 1)} is a loose comment body`).toBe(false)
    }
  })

  it('balances its braces', () => {
    const opens = (withoutComments.match(/\{/g) ?? []).length
    const closes = (withoutComments.match(/\}/g) ?? []).length
    expect(opens).toBe(closes)
  })

  it('never leaves a conflict marker behind', () => {
    expect(/^(<{7}|={7}|>{7})/m.test(CSS)).toBe(false)
  })
})
