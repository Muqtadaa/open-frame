import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { COLOR_TOKENS, createDefaultRegistry } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { readStyles } from '../styles/read-styles.js'

/**
 * The palette's WCAG 2.2 AA floor, checked against the REAL stylesheet.
 *
 * AA is a product commitment (PRODUCT.md), and a commitment nobody measures is
 * a wish. Parsing the stylesheet rather than restating the hex values here is the
 * whole point: a duplicated palette would drift, and the test would keep passing
 * against colours the app no longer uses.
 */
const CSS = readStyles()

/**
 * EVERY theme, not the first one that matches.
 *
 * The original `token()` took the first `--of-x:` in the file, which was exact
 * while there was one palette and quietly wrong the moment a second arrived:
 * `After Hours` could have shipped an unreadable pair and this suite would have
 * gone on measuring the default world and passing. A test that stops covering
 * what it claims to cover is worse than no test, because it is trusted.
 *
 * Verified by breaking it: setting the After Hours `ink` to `#3b2a63` while the
 * old single-match `token()` was in place kept all 26 assertions green, and
 * fails 3 of them here.
 */
interface Theme {
  readonly name: string
  readonly token: (name: string) => string
}

function blockOf(source: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const [, name, value] of source.matchAll(/--of-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    if (name !== undefined && value !== undefined) values.set(name, value)
  }
  return values
}

function readThemes(): Theme[] {
  const base = new Map<string, string>()
  const overrides = new Map<string, Map<string, string>>()

  for (const match of CSS.matchAll(/:root\s*(\[data-theme=['"]([\w-]+)['"]\])?\s*\{([^}]*)\}/g)) {
    const [, , name, body] = match
    if (body === undefined) continue
    const values = blockOf(body)
    if (values.size === 0) continue
    if (name === undefined) {
      for (const [key, value] of values) base.set(key, value)
    } else {
      overrides.set(name, new Map([...(overrides.get(name) ?? []), ...values]))
    }
  }

  if (base.size === 0) throw new Error('no palette found on :root')

  const lookup =
    (values: Map<string, string>) =>
    (name: string): string => {
      // Falls back to the base palette exactly as the cascade does, so a theme
      // that overrides only part of the world is still measured whole.
      const value = values.get(name) ?? base.get(name)
      if (value === undefined) throw new Error(`token --of-${name} is not defined as a hex colour`)
      return value
    }

  return [
    { name: 'default', token: lookup(base) },
    ...[...overrides].map(([name, values]) => ({ name, token: lookup(values) })),
  ]
}

const THEMES = readThemes()

/**
 * The content hues, FROM THE PALETTE — never a list written out here.
 *
 * Five suites below carried their own copy of seven names. The palette grew to
 * eleven and every one of them went on measuring the original seven and
 * passing, which is the exact failure `readThemes` was rewritten to fix one
 * level up: a test that quietly stops covering what it claims to cover is
 * worse than no test, because it is trusted.
 *
 * Black and white are held out and asserted separately. They are the two
 * tokens that mean themselves rather than naming a hue — ink and paper are one
 * value — so "the ink reads on the paper" is 1:1 for them by construction, and
 * folding them in would mean either a failing suite or a weakened floor.
 */
const NEUTRAL = ['black', 'white'] as const
const HUES = COLOR_TOKENS.filter(
  (token): token is Exclude<(typeof COLOR_TOKENS)[number], 'black' | 'white'> =>
    !(NEUTRAL as readonly string[]).includes(token),
)

/** Every theme must define a palette; a typo in the selector would silently skip one. */
if (THEMES.length < 2)
  throw new Error(`expected the default world and After Hours, got ${String(THEMES.length)}`)

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
  /*
   * The front door sets its specimen labels, timestamps and notes in muted ink
   * on page stock. It was the one surface in the product that was not the
   * ruled page, and ruling it introduced a pair nothing had measured.
   */
  ['ink-muted', 'page'],
  /* A ledger row's title on the accent wash it takes when hovered. */
  ['ink', 'accent-soft'],
  /* Knocked-out text on ink: the tool tip, and the primary action on hover. */
  ['panel', 'ink'],
  ['accent', 'panel'],
  ['accent', 'accent-soft'],
  ['danger', 'panel'],
  /*
   * The mentions bell, which is knocked-out text on the accent itself rather
   * than on the wash — a pair nothing measured until something set it.
   */
  ['panel', 'accent'],
  /* And a row of that list under the pointer, which is ink on the hover stock. */
  ['ink', 'hover'],
  /*
   * The workspace filter: a muted board count inside the selected tab's wash,
   * and the accent used as TEXT on page stock rather than as a control's
   * boundary. The accent-on-page pair is asserted below at the 3:1 control
   * floor as well — the two floors are different questions about the same
   * pair, and a label you have to read is the stricter one.
   */
  ['ink-muted', 'accent-soft'],
  ['accent', 'page'],
  /*
   * A CODE BLOCK's ground, and the language label on it.
   *
   * The block sits on `s-gray` rather than the panel, so `ink` and `ink-muted`
   * on that surface are two more pairs nothing had measured.
   */
  ['ink', 's-gray'],
  ['ink-muted', 's-gray'],
  /*
   * A guide's distance: the measurement is read, mid-drag, in the page's
   * colour on the guide's own.
   */
  ['page', 'guide'],
]

/** 1.4.11 Non-text Contrast: boundaries you must perceive to operate a control. */
const CONTROLS: readonly (readonly [string, string])[] = [
  ['control-border', 'panel'],
  ['control-border', 'page'],
  ['control-border', 'bg'],
  ['accent', 'page'],
]

describe.each(THEMES)('palette contrast — $name', ({ token }) => {
  it.each(TEXT)('%s on %s meets AA for text (4.5:1)', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(CONTROLS)('%s on %s meets AA for controls (3:1)', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(3)
  })

  /*
   * The ARMED tool, read off the rule that paints it rather than listed here:
   * a pair written into this file stays green when the rule moves to another
   * one. The active tool is a filled ink bed with a page-coloured icon, and
   * the icon is what says which tool you are holding — 3:1, a graphic you
   * must perceive to operate the rail.
   */
  it('the armed tool’s icon reads on its bed (3:1)', () => {
    const rule = /\.of-tool--active[^{]*\{([^}]*)\}/.exec(CSS)?.[1] ?? ''
    const fg = /(?<![\w-])color:\s*var\(--of-([\w-]+)\)/.exec(rule)?.[1]
    const bg = /(?<![\w-])background:\s*var\(--of-([\w-]+)\)/.exec(rule)?.[1]
    expect(fg, 'the active tool names its icon colour as a token').toBeDefined()
    expect(bg, 'the active tool names its bed as a token').toBeDefined()
    expect(contrast(token(fg ?? ''), token(bg ?? ''))).toBeGreaterThanOrEqual(3)
  })

  /*
   * A PRESSED toggle — snap, in the zoom cluster — draws its own boundary.
   * Its bed alone was 1.13:1 against the bar in the notebook world, so only
   * the icon's colour said it was on. The ring is read off the rule, and must
   * reach 3:1 against the bar's own stock in both worlds.
   */
  it('a pressed toggle draws a boundary you can see (3:1)', () => {
    const rule = /\.of-icon-button--on\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? ''
    const ring = /box-shadow:[^;]*var\(--of-([\w-]+)\)/.exec(rule)?.[1]
    expect(ring, 'a pressed toggle rings itself in a token').toBeDefined()
    expect(contrast(token(ring ?? ''), token('page'))).toBeGreaterThanOrEqual(3)
  })

  /**
   * ...and that boundary is not a second focus ring.
   *
   * It was an accent ring all the way round, one pixel inside the focus ring's
   * accent ring two pixels outside — so a focused toggle and a pressed one
   * looked like the same state at two weights, and a focused PRESSED one wore
   * both (audit 2026-09-27). Pressed is a bar along one edge: a different
   * shape, so the two can never be read for each other.
   */
  it('a pressed toggle is marked by an edge, not by a ring', () => {
    const rule = /\.of-icon-button--on\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? ''
    const shadow = /box-shadow:([^;]*);/.exec(rule)?.[1] ?? ''
    expect(shadow, 'a pressed toggle marks itself with an inset shadow').toContain('inset')
    // An all-round ring is `inset 0 0 0 <spread>`; an edge bar has an offset.
    expect(shadow).not.toMatch(/inset\s+0\s+0\s+0\s/)
  })

  /**
   * A shape's stroke and label on its own fill.
   */
  it.each(HUES)('%s ink on its own surface meets AA for text', (name) => {
    expect(contrast(token(`c-${name}`), token(`s-${name}`))).toBeGreaterThanOrEqual(4.5)
  })

  /**
   * And the pair a STICKY renders, which is a different one.
   *
   * `.of-sticky` sets its body from `s-*` and never sets a colour, so its text
   * is `ink` on the slip — the pair above is the shape pair. Both ship, and
   * until After Hours arrived only one of them was measured: on a light page
   * every `ink`-on-slip combination passes by a mile, so the gap cost nothing
   * and stayed invisible. On a dark page it is the pair that can actually fail,
   * because `s-*` and `ink` are now both moving.
   */
  it.each(HUES)('sticky text on a %s slip meets AA for text', (name) => {
    expect(contrast(token('ink'), token(`s-${name}`))).toBeGreaterThanOrEqual(4.5)
  })

  /**
   * EVERY ink on EVERY surface, because a text colour can be picked freely.
   *
   * The two suites above measure the pairs the app CHOOSES: a shape's own ink
   * on its own fill, a sticky's default ink on its slip. A text colour is the
   * user's choice, so any of the seven inks can land on any of the seven
   * slips, and 49 pairs ship the moment the control does. Measuring only the
   * matched pair would leave 42 combinations the product offers and nothing
   * checks.
   *
   * These all pass today — the inks were drawn to read on a light page and the
   * slips are pale tints of the same family — which is exactly why the control
   * could be offered whole rather than with some combinations withheld. It is
   * also why this has to be a test: nothing about the palette FORCES it, and a
   * later ink chosen for its own sake would break it silently.
   */
  it.each(HUES.flatMap((ink) => HUES.map((surface) => [ink, surface] as const)))(
    '%s text on a %s slip meets AA for text',
    (ink, surface) => {
      expect(contrast(token(`c-${ink}`), token(`s-${surface}`))).toBeGreaterThanOrEqual(4.5)
    },
  )

  /**
   * And on the two grounds text can sit on without a slip under it: a frame's
   * title hangs above the frame on the page, and a connector's label rides
   * the line over the board itself.
   */
  it.each(HUES)('%s text on the board meets AA for text', (ink) => {
    expect(contrast(token(`c-${ink}`), token('bg'))).toBeGreaterThanOrEqual(4.5)
  })

  /**
   * THE TWO THAT MEAN THEMSELVES.
   *
   * Black and white have one value for ink and paper, so the hue grid cannot
   * hold them: white ink on white paper is 1:1 and always will be. What has to
   * be true instead is that the pairs the interface can actually PRODUCE are
   * readable — and it only ever produces them through `readableInkOn`, which
   * answers white for a black fill and black for a white fill.
   *
   * Asserted here rather than trusted, because the two values live in the
   * stylesheet and could drift apart from the function that pairs them.
   */
  it('reads white ink on the black slip and black ink on the white one', () => {
    expect(contrast(token('c-white'), token('s-black'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('c-black'), token('s-white'))).toBeGreaterThanOrEqual(4.5)
  })

  /**
   * One of the two neutrals reads on every slip, in every world.
   *
   * NOT "black reads on every slip", which was the first version of this and
   * failed honestly: After Hours slips are dark, so black ink on a night-green
   * slip is genuinely unreadable and asserting otherwise would have meant
   * weakening the floor to make a false claim pass.
   *
   * What is true, and is the whole guarantee behind offering black and white at
   * all, is that whichever world you are in there is always a neutral that
   * works — which is what `readableInkOn` returns without being asked. An
   * explicit choice can still be a poor one; that is the swatch row's warning
   * to give, not this suite's to prevent.
   */
  it.each(HUES)('leaves a readable neutral for the %s slip', (hue) => {
    const slip = token(`s-${hue}`)
    const best = Math.max(contrast(token('c-black'), slip), contrast(token('c-white'), slip))
    expect(best).toBeGreaterThanOrEqual(4.5)
  })

  /**
   * And the black slip is not the page.
   *
   * In After Hours the ground is already dark, so a black slip that matched it
   * would be a hole in the page rather than something laid on it — the exact
   * failure the night world's lit top edge exists to prevent.
   */
  it('keeps the black slip clear of the ground it sits on', () => {
    const [sr, sg, sb] = channels(token('s-black'))
    const [br, bg, bb] = channels(token('bg'))
    expect(Math.hypot(sr - br, sg - bg, sb - bb)).toBeGreaterThan(20)
  })

  /**
   * SYNTAX HIGHLIGHTING, measured like any other text.
   *
   * The highlighter ships themes of hard-coded hex values; using one would put
   * six more colours outside the token system, invisible to this test and
   * wrong in one of the two palettes. Its classes are mapped to this product's
   * content colours instead, and every one of them is read against the code
   * block's surface — including in After Hours, where they move.
   */
  it.each(['violet', 'green', 'orange', 'blue', 'gray', 'red'])(
    'code highlighted in %s is readable on the code surface',
    (name) => {
      expect(contrast(token(`c-${name}`), token('s-gray'))).toBeGreaterThanOrEqual(4.5)
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

  /**
   * Presence hues identify PEOPLE, and three things have to be true of them.
   */
  describe('the presence palette', () => {
    const HUES = [1, 2, 3, 4, 5, 6].map((n) => `p-${String(n)}`)

    /** A cursor is a UI component you must perceive to use — 1.4.11's floor. */
    it.each(HUES)('%s is visible on the page and on a panel', (hue) => {
      expect(contrast(token(hue), token('page'))).toBeGreaterThanOrEqual(3)
      expect(contrast(token(hue), token('panel'))).toBeGreaterThanOrEqual(3)
    })

    /**
     * Six people are told apart by hue and nothing else, so this is the one
     * separation with no other signal backing it up.
     */
    it('keeps six people distinguishable from one another', () => {
      for (const [i, a] of HUES.entries()) {
        for (const b of HUES.slice(i + 1)) {
          const [ar, ag, ab] = channels(token(a))
          const [br, bg, bb] = channels(token(b))
          expect(
            Math.hypot(ar - br, ag - bg, ab - bb),
            `${a} and ${b} are too close to tell apart`,
          ).toBeGreaterThan(60)
        }
      }
    })

    /**
     * And clear of the three hues that MEAN something. A looser threshold than
     * above, deliberately: a remote selection is dashed and carries a name tag,
     * so hue is not the only thing distinguishing it from your own — which is
     * what lets the palette have six usable members at all.
     */
    it.each(['accent', 'guide', 'danger'])('stays clear of %s', (reserved) => {
      const [rr, rg, rb] = channels(token(reserved))
      for (const hue of HUES) {
        const [hr, hg, hb] = channels(token(hue))
        expect(
          Math.hypot(hr - rr, hg - rg, hb - rb),
          `${hue} could be mistaken for ${reserved}`,
        ).toBeGreaterThan(45)
      }
    })

    /*
     * A face's INITIAL is text on the person's hue, so it takes the text floor
     * — in the page's or the panel's colour, never in ink, which reads at
     * 1.5–3:1 on these hues. The mention menu's faces were set in ink.
     */
    it.each(HUES)('%s carries a readable initial', (hue) => {
      expect(contrast(token('page'), token(hue))).toBeGreaterThanOrEqual(4.5)
      expect(contrast(token('panel'), token(hue))).toBeGreaterThanOrEqual(4.5)
    })
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
  /**
   * `.of-dev__*` is the bench panel's instrumentation.
   *
   * Its COMPONENT is stripped from a production build by the compile-time
   * `define` (rule 12) — verified by grepping a clean `pnpm build` for
   * `DevPanel`, which finds nothing. Its rules still ship in the stylesheet,
   * inert, because CSS has no equivalent of that branch. The comment here used
   * to claim both were stripped, which was half true and the misleading half.
   */
  const DEV_ONLY = /\.of-dev__[^{]*\{[^}]*\}/g
  /**
   * The colour PICKER, which paints the colour space rather than the scheme.
   *
   * Its hue ramp is the spectrum and the two washes over its area are the
   * definition of saturation and value. A token there would mean showing
   * somebody a different colour from the one they are pointing at, so these
   * rules are exempt — and narrowly: `.of-picker__area`, `__hue` and
   * `__pointer` only, with their pseudo-elements. The picker's own chrome,
   * its panel, border, text and the low-contrast warning, is tokenised like
   * everything else and is NOT covered by this.
   */
  const COLOUR_SPACE = /\.of-picker__(area|hue|pointer)(::(before|after))?[^{]*\{[^}]*\}/g

  it('defines every colour as a token', () => {
    const withoutRoot = CSS.replace(/:root[^{]*\{[^}]*\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(DEV_ONLY, '')
      .replace(COLOUR_SPACE, '')

    const literals = withoutRoot.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) ?? []
    expect(literals).toEqual([])
  })

  /**
   * And the exemption cannot be used as a door.
   *
   * A rule that excludes part of the file is a rule somebody can widen by
   * putting a literal in an excluded selector. This asserts the exclusion
   * covers what it says: three selectors, and the picker's own chrome is
   * still measured — verified by putting `color: #ff0000` on
   * `.of-picker__contrast` and watching the test above fail.
   */
  it('exempts only the three selectors that paint the spectrum', () => {
    const exempted = [...CSS.matchAll(COLOUR_SPACE)].map(
      (match) => /\.of-picker__\w+(::\w+)?/.exec(match[0])?.[0],
    )
    expect(new Set(exempted)).toEqual(
      new Set([
        '.of-picker__area',
        '.of-picker__area::before',
        '.of-picker__area::after',
        '.of-picker__pointer',
        '.of-picker__hue',
      ]),
    )
  })
})

/**
 * The record panel's columns have to add up.
 *
 * Its width was chosen so a full row of the swatch grid fits, and the swatches
 * live in the control column — so the label column is spending the same
 * budget. Widening labels (which had to happen: they come from the registry
 * now, and "participant" was being clipped to "participa") silently takes
 * space from the swatches, and a grid that wraps short of its own column count
 * reads as an accident rather than a palette.
 *
 * The column count is read from the grid rather than written here. This test
 * was named for SEVEN swatches after the palette had become a 6×2 grid, so it
 * went on proving room for a row that no longer existed.
 *
 * The numbers live in two files — the panel's width in `Inspector.tsx`, the
 * columns in the stylesheet — so nothing but arithmetic connects them. This is
 * that arithmetic, run on every build.
 */
describe('the record panel fits what it promises to show', () => {
  /*
   * Resolves a token, because these sizes ARE tokens now.
   *
   * The interface scale moved onto the quadrille and every height became
   * `var(--of-hit-sm)` and friends, at which point this arithmetic stopped
   * being able to read its own inputs. Teaching it the token table is the only
   * version that survives the next change; matching literal pixels would have
   * meant un-tokenising the stylesheet to keep a test happy.
   */
  const SIZES = new Map<string, number>()
  for (const [, name = '', value = ''] of CSS.matchAll(/(--of-[\w-]+):\s*(\d+)px;/g)) {
    SIZES.set(name, Number(value))
  }

  const px = (pattern: RegExp): number => {
    const match = pattern.exec(CSS)
    const value = match?.[1]
    if (value === undefined) throw new Error(`No match for ${String(pattern)}`)
    const token = SIZES.get(value.replace(/^var\(|\)$/g, ''))
    if (token !== undefined) return token
    const literal = Number(value.replace(/px$/, ''))
    if (Number.isNaN(literal)) throw new Error(`Cannot read a size from "${value}"`)
    return literal
  }

  it('leaves room for a full row of the swatch grid', () => {
    const inspector = readFileSync(resolve(process.cwd(), 'src/ui/Inspector.tsx'), 'utf8')
    const widthMatch = /const PANEL_WIDTH = (\d+)/.exec(inspector)
    expect(widthMatch?.[1]).toBeDefined()
    const panelWidth = Number(widthMatch?.[1])

    const size = String.raw`(\d+px|var\(--of-[\w-]+\))`
    const read = (pattern: string): number => px(new RegExp(pattern.replace('SIZE', size)))

    const labelColumn = read(String.raw`\.of-field \{[^}]*grid-template-columns:\s*SIZE`)
    const columnGap = read(String.raw`\.of-field \{[^}]*\n\s*gap:\s*SIZE`)
    const columns = /\.of-swatches \{[^}]*grid-template-columns:\s*repeat\((\d+),/.exec(CSS)?.[1]
    expect(columns).toBeDefined()
    const perRow = Number(columns)
    const swatch = read(
      String.raw`\.of-swatches \{[^}]*grid-template-columns:\s*repeat\(\d+,\s*SIZE`,
    )
    const swatchGap = read(String.raw`\.of-swatches \{[^}]*gap:\s*SIZE`)
    const sidePadding = read(String.raw`\.of-inspector \{[^}]*\n\s*padding:\s*SIZE`)
    // The panel's own 1px border, both sides.
    const border = 2

    const control = panelWidth - border - sidePadding * 2 - labelColumn - columnGap
    const swatchRow = swatch * perRow + swatchGap * (perRow - 1)

    expect(swatchRow).toBeLessThanOrEqual(control)
  })
})

/**
 * The Twelve Pixel Floor (DESIGN.md, CLAUDE.md rule 22).
 *
 * Nothing a user must read is set below 12px — shortcuts, field labels,
 * readouts, counts. The floor was written down at 12 while 27 rules sat at 11,
 * because a floor that lives only in prose is a floor nothing measures.
 *
 * Relative sizes (`em`) are the rich-text scale inside an object and belong to
 * the user's content, so only absolute pixel sizes are read here.
 */
describe('the twelve pixel floor', () => {
  const FLOOR = 12
  /*
   * No exemptions. There was one — the record panel's size choice drew each
   * step at its own size, so "small" was a specimen of 10px type — and it
   * went with the control when a connector's label became rich text
   * (ADR 0014).
   */
  /**
   * Sizes are ramp tokens now, so the floor has to READ the ramp — a check
   * that only looked at literal `px` would pass on a stylesheet with no
   * literals left in it, whatever the ramp said.
   */
  const RAMP = new Map<string, number>()
  // In px at the default 16px root: the interface's steps are written in rem.
  for (const [, name = '', value = '', unit = ''] of CSS.matchAll(
    /(--of-type-[\w-]+):\s*([\d.]+)(px|rem);/g,
  )) {
    // The root's definition only: the board redefines the ramp in world
    // units, and letting that overwrite this would compare it with itself.
    if (!RAMP.has(name)) RAMP.set(name, unit === 'rem' ? Number(value) * 16 : Number(value))
  }
  const sizeOf = (value: string): number | null => {
    const token = /^var\((--of-type-[\w-]+)\)$/.exec(value)
    if (token !== null) return RAMP.get(token[1] ?? '') ?? null
    const literal = /^([\d.]+)px$/.exec(value)
    return literal === null ? null : Number(literal[1])
  }
  const rules = (): [string, string][] => {
    const source = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    const found: [string, string][] = []
    for (const [, selector = '', body = ''] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const [, size = ''] of body.matchAll(/(?<![\w-])font-size:\s*([^;]+);/g)) {
        found.push([selector.trim(), size.trim()])
      }
    }
    return found
  }

  /*
   * The INTERFACE's type follows the reader's text size (audit 2026-09-27):
   * set in px, a browser's text-size preference changed nothing. Display type
   * is a text object's size — content, in world units — and stays in px, or
   * one board would lay out differently for two people looking at it.
   */
  it('sets the interface ramp in rem, and content in px', () => {
    // Each token's first definition — the root's; the board redefines its own.
    const units = new Map<string, string>()
    for (const [, name = '', unit = ''] of CSS.matchAll(/(--of-type-[\w-]+):\s*[\d.]+(px|rem);/g)) {
      if (!units.has(name)) units.set(name, unit)
    }
    expect(units.size).toBeGreaterThan(5)
    for (const [name, unit] of units) {
      expect(`${name} ${unit}`).toBe(`${name} ${name === '--of-type-display' ? 'px' : 'rem'}`)
    }
  })

  /*
   * ...but inside the board it is content, and set in world units: the same
   * steps, in px, on `.of-world`. Held equal, so the two never drift apart.
   */
  it('gives the board the same ramp in world units', () => {
    const world = /\.of-world\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? ''
    const inWorld = new Map(
      [...world.matchAll(/(--of-type-[\w-]+):\s*([\d.]+)px;/g)].map(([, name = '', px = '']) => [
        name,
        Number(px),
      ]),
    )
    const interfaceSteps = [...RAMP].filter(([name]) => name !== '--of-type-display')
    expect(interfaceSteps.length).toBeGreaterThan(5)
    for (const [name, px] of interfaceSteps)
      expect(`${name} ${String(inWorld.get(name))}`).toBe(`${name} ${String(px)}`)
  })

  it('sets no functional text below 12px', () => {
    const below = rules()
      .filter(([, size]) => {
        const px = sizeOf(size)
        return px !== null && px < FLOOR
      })
      .map(([selector, size]) => `${selector}: ${size}`)
    expect(below).toEqual([])
  })

  it('puts no step of the ramp below the floor', () => {
    expect(RAMP.size).toBeGreaterThan(0)
    expect([...RAMP].filter(([, px]) => px < FLOOR)).toEqual([])
  })

  /**
   * The ramp (DESIGN.md, Typography). 114 of 122 sizes were raw pixels, in
   * nine values, so "the type scale" was whichever number the last rule
   * happened to use. Every interface size now names a step; content inside an
   * object scales in `em` from its object and is not on the ramp.
   */
  it('draws every interface size from the ramp', () => {
    const off = rules()
      .filter(([, size]) => !/^var\(--of-type-[\w-]+\)$/.test(size) && !size.endsWith('em'))
      .map(([selector, size]) => `${selector}: ${size}`)
    expect(off).toEqual([])
  })
})

/**
 * The radius scale (DESIGN.md, Shapes).
 *
 * Seventeen radii were in use against one token, so "corners get smaller the
 * closer a form is to the page" was a sentence rather than a property of the
 * stylesheet. Every corner now names its step; a new one either takes a step
 * or adds one to the scale in `:root`, where it has to say what it is for.
 */
describe('the radius scale', () => {
  it('draws every corner from a step of the scale', () => {
    const source = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    const off: string[] = []
    for (const [, value = ''] of source.matchAll(/(?<![\w-])border-radius:\s*([^;]+);/g)) {
      const parts = value.trim().split(/\s+(?![^(]*\))/)
      const onScale = parts.every(
        (part) => part === '0' || part === 'inherit' || /^var\(--of-radius(-[a-z]+)?\)$/.test(part),
      )
      if (!onScale) off.push(value.trim())
    }
    expect(off).toEqual([])
  })

  it('defines the scale it asks for', () => {
    const defined = new Set([...CSS.matchAll(/(--of-radius(?:-[a-z]+)?):/g)].map((m) => m[1]))
    const used = new Set([...CSS.matchAll(/var\((--of-radius(?:-[a-z]+)?)\)/g)].map((m) => m[1]))
    expect([...used].filter((name) => !defined.has(name))).toEqual([])
  })
})

/**
 * The layers. Ten bare integers from 1 to 100 said nothing about why one thing
 * paints over another; every z-index now names a layer in `:root`, which is
 * where the order is read as one list and has to be argued for.
 */
describe('the layers', () => {
  it('stacks everything on a named layer', () => {
    const source = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    const off = [...source.matchAll(/(?<![\w-])z-index:\s*([^;]+);/g)]
      .map((match) => (match[1] ?? '').trim())
      .filter((value) => !/^var\(--of-z-[a-z]+\)$/.test(value) && value !== 'auto' && value !== '0')
    expect(off).toEqual([])
  })

  it('defines every layer it asks for', () => {
    const defined = new Set([...CSS.matchAll(/(--of-z-[a-z]+):/g)].map((m) => m[1]))
    const used = new Set([...CSS.matchAll(/var\((--of-z-[a-z]+)\)/g)].map((m) => m[1]))
    expect([...used].filter((name) => !defined.has(name))).toEqual([])
  })
})

/**
 * Motion (DESIGN.md, Motion). Timing is `--of-quick`, `--of-settle`,
 * `--of-hold` and `--of-stagger` on `--of-ease`; the tool tip ran its own
 * 110ms ease-out and the sheets their own 160ms beside a token that already
 * said 140. A duration anywhere but the token block is a second clock.
 */
describe('one clock', () => {
  it('times nothing outside the motion tokens', () => {
    const source = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    const declarations = [...source.matchAll(/(?<![\w-])(transition|animation)[\w-]*:\s*([^;]+);/g)]
    const literal = declarations
      .map((match) => (match[2] ?? '').trim())
      .filter((value) => /\d+m?s\b|ease-(in|out)|\blinear\b/.test(value))
    expect(literal).toEqual([])
  })
})

/**
 * The spacing scale. Sixteen values were in use for padding, margins and gaps,
 * with a 3, 5, 7 and 9 beside the 2, 4, 6 and 8 they were meant to be. Every
 * space from 2px to 20px now names a step; above that a length is a size, not
 * rhythm, and a 1px hairline offset or a negative pull stays as written.
 */
describe('the spacing scale', () => {
  it('spaces everything from 2px to 20px on a step of the scale', () => {
    const source = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    const off: string[] = []
    const property = /(?<![\w-])((?:padding|margin)[\w-]*|gap|row-gap|column-gap):\s*([^;]+);/g
    for (const [, name = '', value = ''] of source.matchAll(property)) {
      for (const [, px = ''] of value.matchAll(/(?<![\w.(-])(\d+)px/g)) {
        if (Number(px) >= 2 && Number(px) <= 20) off.push(`${name}: ${value.trim()}`)
      }
    }
    expect(off).toEqual([])
  })

  /*
   * Above the scale a space is a size — but a size on the page's own rule:
   * DESIGN.md says every offset in the chrome is a multiple of ten. The front
   * door's 28px gap and 48px/24px page margins, and a pin lifted by -26px,
   * were each a number chosen by eye (audit 2026-09-27).
   */
  it('spaces everything above the scale on the rule', () => {
    const source = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    const off: string[] = []
    const property = /(?<![\w-])((?:padding|margin)[\w-]*|gap|row-gap|column-gap):\s*([^;]+);/g
    for (const [, name = '', value = ''] of source.matchAll(property)) {
      for (const [, px = ''] of value.matchAll(/(?<![\w.(])-?(\d+)px/g)) {
        if (Number(px) > 20 && Number(px) % 10 !== 0) off.push(`${name}: ${value.trim()}`)
      }
    }
    expect(off).toEqual([])
  })

  it('defines every step it asks for', () => {
    const defined = new Set([...CSS.matchAll(/(--of-space-\d+):/g)].map((m) => m[1]))
    const used = new Set([...CSS.matchAll(/var\((--of-space-\d+)\)/g)].map((m) => m[1]))
    expect([...used].filter((name) => !defined.has(name))).toEqual([])
  })
})

/**
 * The icon button. Six private versions at four sizes became one, and the
 * ones under 30px were under this world's target for a secondary control.
 * Nothing may bring a private one back beside it at a smaller size.
 */
describe('one icon button', () => {
  it('holds the secondary target at its smallest', () => {
    const rule = /\.of-icon-button \{([^}]*)\}/.exec(CSS)?.[1] ?? ''
    expect(rule).toContain('min-width: var(--of-hit-sm);')
    expect(rule).toContain('height: var(--of-hit-sm);')
  })

  it('leaves none of the private versions behind', () => {
    const retired = [
      '.of-status__action',
      '.of-home__row-action ',
      '.of-inspector__remove',
      '.of-arrange__button',
      '.of-zoom__button',
    ]
    expect(retired.filter((selector) => CSS.includes(selector))).toEqual([])
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

/*
 * A narrow window drops the save state's word to make room — but never a
 * FAILURE. `display: none` also takes the live region out of the tree, so a
 * phone-width window was the one place a failed save said nothing at all.
 */
describe('a failed save survives a narrow window', () => {
  it('lets a short bar hide only the quiet readout, never a failure or an offline room', () => {
    const css = readStyles().replace(/\/\*[\s\S]*?\*\//g, '')
    // Every rule anywhere that hides part of the readout.
    const hides = [...css.matchAll(/([^{}]*of-status__save[^{}]*)\{[^}]*display:\s*none/g)].map(
      (m) => (m[1] ?? '').trim(),
    )
    expect(hides.length, 'the rules are found, so this is not vacuous').toBeGreaterThan(0)
    for (const selector of hides) {
      // The quiet tone whole, or the second half of a reading — "· saved here".
      expect(selector).toMatch(/\.of-status__save--quiet$|\.of-status__save-more$/)
    }
  })
})

/*
 * The format bar's size readout names each step of the type ladder as a
 * multiple of the object's own size. Those multiples ARE the `.of-size--*`
 * rules, so the readout is held to the stylesheet: change a step's em and
 * leave the readout alone, and the bar would name a size the text is not.
 */
describe('the format bar names the sizes the stylesheet draws', () => {
  it('matches every .of-size rule, and md is the object itself', async () => {
    const { SIZE_SCALE } = await import('../views/FormatBar.js')
    for (const [token, scale] of Object.entries(SIZE_SCALE)) {
      const rule = new RegExp(`\\.of-size--${token}\\s*\\{\\s*font-size:\\s*([\\d.]+)em`).exec(CSS)
      if (token === 'md') {
        expect(rule, 'md is the object size and has no rule').toBeNull()
        expect(scale).toBe(1)
      } else {
        expect(rule?.[1], `.of-size--${token}`).toBe(String(scale))
      }
    }
  })
})

/*
 * Which colour each face's initial is SET in. The token pairs above say page
 * and panel are readable on every hue; this says those are what is used.
 */
describe('face initials', () => {
  it.each(['of-status__person', 'of-comment__who', 'of-mention-menu__face'])(
    '.%s sets its initial in page or panel colour',
    (face) => {
      const rule = new RegExp(`\\.${face}\\s*\\{([^}]*)\\}`).exec(CSS)
      expect(rule, `.${face} rule`).not.toBeNull()
      const colour = /(?:^|[;\s])color:\s*([^;]+);/.exec(rule?.[1] ?? '')?.[1]?.trim()
      expect(['var(--of-page)', 'var(--of-panel)']).toContain(colour)
    },
  )
})

/*
 * The selection, the snap guides and a route's legs are thin lines of one
 * colour, drawn over whatever is on the board. On their own they vanished
 * where they were needed: the accent was 2.2:1 on a black note in the
 * notebook, 1.7:1 on a white one After Hours, and 1.0–1.2:1 against every
 * coloured connector — a line's legs disappeared into the line (C3 #7).
 *
 * So each one carries a HALO in the page's colour, and the pair is measured:
 * on every ground a line can be drawn over — the page, every slip and every
 * ink — either the line or its halo clears 3:1, and the line clears 3:1
 * against its own halo, so wherever the halo shows, the line shows on it.
 * Read off the rules, so a halo that is removed or recoloured fails here.
 */
describe.each(THEMES)('the apparatus reads on anything — $name', ({ token }) => {
  const LINES: readonly { readonly rule: string; readonly ink: RegExp }[] = [
    { rule: '.of-selection', ink: /(?<![\w-])outline:[^;]*var\(--of-([\w-]+)\)/ },
    { rule: '.of-guide', ink: /(?<![\w-])background:\s*var\(--of-([\w-]+)\)/ },
    { rule: '.of-endpoint--leg', ink: /(?<![\w-])background:[^;]*var\(--of-([\w-]+)\)/ },
    // A table's selected cell: its ring sat on the grid lines and got lost.
    { rule: '.of-table-ring', ink: /(?<![\w-])border:[^;]*var\(--of-([\w-]+)\)/ },
  ]
  const GROUNDS = [
    'page',
    'bg',
    ...COLOR_TOKENS.map((hue) => `s-${hue}`),
    ...COLOR_TOKENS.map((hue) => `c-${hue}`),
  ]

  describe.each(LINES)('$rule', ({ rule, ink }) => {
    const escaped = rule.replace(/[.-]/g, (c) => `\\${c}`)
    const body = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(CSS)?.[1] ?? ''
    const line = ink.exec(body)?.[1]
    const halo = /box-shadow:[^;]*var\(--of-([\w-]+)\)/.exec(body)?.[1]

    it('names its colour and its halo as tokens', () => {
      expect(line, `${rule} names its colour`).toBeDefined()
      expect(halo, `${rule} carries a halo`).toBeDefined()
    })

    it('shows on its own halo (3:1)', () => {
      expect(contrast(token(line ?? ''), token(halo ?? ''))).toBeGreaterThanOrEqual(3)
    })

    it.each(GROUNDS)('shows, or its halo does, over %s (3:1)', (ground) => {
      const best = Math.max(
        contrast(token(line ?? ''), token(ground)),
        contrast(token(halo ?? ''), token(ground)),
      )
      expect(best).toBeGreaterThanOrEqual(3)
    })
  })
})

/** Every file under `views/table/`, which is where a table is drawn. */
function tableParts(): string[] {
  return readdirSync(resolve(process.cwd(), 'src/views/table'))
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => `src/views/table/${file}`)
}

/*
 * An object's EDGE is how you find it on the board, so it is a graphic you
 * must perceive — 3:1 against what it sits on (PRODUCT.md's open gap, closed
 * in C3 #8). A white shape in the notebook was 1.06:1 on the page and a black
 * one After Hours 1.14:1; the frame's edge was 1.45:1; a table's inner grid
 * 1.20:1 on its own ground. Read off the rule and the view that draw them, so
 * an edge moved back onto a quieter token fails here.
 */
describe.each(THEMES)('edges that never vanish — $name', ({ token }) => {
  // The table's view and the parts it is drawn from.
  const TABLE = ['src/views/TableView.tsx', ...tableParts()]
    .map((path) => readFileSync(resolve(process.cwd(), path), 'utf8'))
    .join('\n')

  it.each(['line-black', 'line-white'])('a %s stroke shows on the page and the desk', (line) => {
    expect(contrast(token(line), token('page'))).toBeGreaterThanOrEqual(3)
    expect(contrast(token(line), token('bg'))).toBeGreaterThanOrEqual(3)
  })

  // PRODUCT.md's recorded gap: a fresh shape's outline on its own default fill.
  it("a default shape's outline shows on its fill and on the page", () => {
    expect(contrast(token('c-gray'), token('s-gray'))).toBeGreaterThanOrEqual(3)
    expect(contrast(token('c-gray'), token('page'))).toBeGreaterThanOrEqual(3)
  })

  it("a frame's edge shows on the page", () => {
    const body = /\.of-frame__edge\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? ''
    const edge = /(?<![\w-])border:[^;]*var\(--of-([\w-]+)\)/.exec(body)?.[1] ?? ''
    expect(contrast(token(edge), token('page'))).toBeGreaterThanOrEqual(3)
  })

  it("a table's lines show on its ground, inside and out", () => {
    const resolve = /function resolveLine[\s\S]*?\n}/.exec(TABLE)?.[0] ?? ''
    const [outer, inner] = [...resolve.matchAll(/'var\(--of-([\w-]+)\)'/g)].map((m) => m[1] ?? '')
    expect(outer, 'the outer line names a token').toBeDefined()
    expect(inner, 'the inner line names a token').toBeDefined()
    expect(contrast(token(outer ?? ''), token('panel'))).toBeGreaterThanOrEqual(3)
    expect(contrast(token(inner ?? ''), token('panel'))).toBeGreaterThanOrEqual(3)
  })
})

/*
 * AFTER HOURS, where a slip is a deep colour on a deep page. Violet and blue —
 * a hypothesis and an insight, the slips that matter most — were 1.2:1 on the
 * night page, held apart only by a 9% lit edge; and a white slip was 18:1,
 * the brightest thing on the board by some way. So a slip carries a hairline
 * that clears 3:1 on the page, read off the slip shadow itself, and white
 * paper is dimmed until it is no brighter than the ink.
 */
describe.each(THEMES.filter((theme) => theme.name !== 'default'))(
  'slips at night — $name',
  ({ name, token }) => {
    const block =
      new RegExp(`:root\\[data-theme=['"]${name}['"]\\]\\s*\\{([^}]*)\\}`).exec(CSS)?.[1] ?? ''

    it('carries a hairline that shows on the page (3:1)', () => {
      const ring = /--of-slip-ring:([^;]*);/.exec(block)?.[1] ?? ''
      const edge = /0 0 0 1px var\(--of-([\w-]+)\)/.exec(ring)?.[1]
      expect(edge, 'the night slip ring names its hairline as a token').toBeDefined()
      // And the ring is actually worn, by the note and by every typed slip.
      for (const slip of ['of-sticky', 'of-slip']) {
        const body = new RegExp(`\\.${slip}\\s*\\{([^}]*)\\}`).exec(CSS)?.[1] ?? ''
        expect(body, slip).toMatch(/box-shadow:[^;]*var\(--of-slip-ring\)/)
      }
      expect(contrast(token(edge ?? ''), token('page'))).toBeGreaterThanOrEqual(3)
    })

    it('white paper is no brighter than the ink', () => {
      expect(contrast(token('s-white'), token('page'))).toBeLessThanOrEqual(
        contrast(token('ink'), token('page')),
      )
    })
  },
)

/*
 * A FRAME nobody has coloured is laid on the world's paper (audit 2026-09-27).
 *
 * At night it was white paper under a lamp — dimmed, and still a bright slab
 * the size of a region of the board, under everything placed on it. The
 * owner chose night paper: in the Notebook the paper is white, as it always
 * was; After Hours it is the panel stock, the same dark sheet the board's own
 * panels are cut from. A white somebody CHOSE stays white — this is the
 * default, not the palette.
 */
describe.each(THEMES)("a frame's paper — $name", ({ name, token }) => {
  const block =
    name === 'default'
      ? [...CSS.matchAll(/:root\s*\{([^}]*)\}/g)].map((match) => match[1] ?? '').join('\n')
      : (new RegExp(`:root\\[data-theme=['"]${name}['"]\\]\\s*\\{([^}]*)\\}`).exec(CSS)?.[1] ?? '')
  const paper = /--of-frame-paper:\s*var\(--of-([\w-]+)\)/.exec(block)?.[1]

  it('is named in this world, as another token', () => {
    expect(paper, 'the frame paper names the stock it is').toBeDefined()
  })

  it(name === 'default' ? 'is white paper by day' : 'is the panel stock at night', () => {
    expect(paper).toBe(name === 'default' ? 's-white' : 'panel')
  })

  it('is never brighter than the ink, and never brighter than white paper', () => {
    const sheet = token(paper ?? '')
    expect(contrast(sheet, token('page'))).toBeLessThanOrEqual(
      contrast(token('ink'), token('page')),
    )
    expect(luminance(sheet)).toBeLessThanOrEqual(luminance(token('s-white')))
  })

  // Its edge is the control border (the Edge Rule), and it must show on it.
  it('shows its edge (3:1)', () => {
    expect(contrast(token('control-border'), token(paper ?? ''))).toBeGreaterThanOrEqual(3)
  })
})

/*
 * The plain kit — shapes, code, images, tables — stays plain, but it is stock
 * on the same page as the slips, so it is cut and laid the same way: the
 * page's 2px corner and the one slip height (DESIGN.md). Code took the
 * control radius, an image the apparatus radius, and none of them sat above
 * the page at all. Shapes are held out: a box shadow is a rectangle, and a
 * diamond's is not.
 */
describe('the plain kit is stock on the page', () => {
  const rule = (selector: string): string =>
    new RegExp(`${selector.replace(/[.-]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`).exec(CSS)?.[1] ??
    ''

  it.each(['.of-code', '.of-image-frame', '.of-table'])(
    '%s is cut and laid like a slip',
    (selector) => {
      const body = rule(selector)
      expect(body).toMatch(/border-radius:\s*var\(--of-radius-slip\)/)
      expect(body).toMatch(/box-shadow:\s*var\(--of-slip-shadow\)/)
    },
  )

  // A placeholder is text somebody has to read to know what to do: 4.5:1.
  it("an empty text's placeholder is muted ink, not a faded one", () => {
    const body = rule('.of-text--empty')
    expect(body).not.toMatch(/opacity/)
    expect(body).toMatch(/(?<![\w-])color:\s*var\(--of-ink-muted\)/)
  })
})

/*
 * A fresh text object's box, against the type it is set in. It was 48 units
 * tall at 22px on a 1.3 line — one line — so the first sentence anybody typed
 * wrapped straight out of sight.
 */
describe('a fresh text box', () => {
  it('holds two lines of display type', () => {
    const size = Number(/--of-type-display:\s*(\d+)px/.exec(CSS)?.[1])
    const leading = Number(/\.of-text\s*\{[^}]*line-height:\s*([\d.]+)/.exec(CSS)?.[1])
    const text = createDefaultRegistry().get('text')
    expect(size).toBeGreaterThan(0)
    expect(leading).toBeGreaterThan(0)
    expect(text?.create().frame.height).toBeGreaterThanOrEqual(2 * size * leading)
  })
})

/*
 * The front door, the account and the share controls (C3 #9). Every boundary
 * one of them DRAWS is a boundary somebody has to see to find the control, so
 * it clears 3:1 on the page and on the panel it may sit on. They were drawn in
 * the panel hairline or a wash, at 1.1–1.8:1: an edge that was there and did
 * nothing. Controls that draw no boundary at all are identified by their words.
 */
describe.each(THEMES)('the front door’s controls are seen — $name', ({ token }) => {
  // Every rule the selector ends, joined: a shared rule comes first and a
  // selector's own declarations after it.
  const rule = (selector: string): string =>
    [
      ...CSS.matchAll(
        new RegExp(`${selector.replace(/[.-]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`, 'g'),
      ),
    ]
      .map((match) => match[1] ?? '')
      .join('\n')

  it.each([
    '.of-status__share',
    '.of-home__confirm-yes',
    '.of-comment__confirm-yes',
    '.of-home__confirm-no',
    '.of-mentions__bell',
    '.of-spaces__tab--on',
  ])('%s draws its edge at 3:1', (selector) => {
    const edge = /(?<![\w-])border:[^;]*var\(--of-([\w-]+)\)/.exec(rule(selector))?.[1]
    expect(edge, `${selector} draws a border in a token`).toBeDefined()
    expect(contrast(token(edge ?? ''), token('page'))).toBeGreaterThanOrEqual(3)
    expect(contrast(token(edge ?? ''), token('panel'))).toBeGreaterThanOrEqual(3)
  })

  // An unpinned pin is a control that is always there, so its glyph is seen.
  it('an unpinned pin is drawn at 3:1, not faded', () => {
    const body = rule('.of-home__pin')
    expect(body).not.toMatch(/opacity/)
    const ink = /(?<![\w-])color:\s*var\(--of-([\w-]+)\)/.exec(body)?.[1]
    expect(ink, 'the pin names its colour').toBeDefined()
    expect(contrast(token(ink ?? ''), token('panel'))).toBeGreaterThanOrEqual(3)
  })
})

describe('the front door’s targets', () => {
  it('"Create an account" is a whole target, not a 23px line of text', () => {
    const body = /\.of-account__switch\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? ''
    expect(body).toMatch(/min-height:\s*var\(--of-hit-sm\)/)
  })
})

/*
 * A POLL'S CONTROLS are drawn on the card's own paper, in any colour the card
 * is given, in either world (audit 2026-10-08). Their edges were a chrome
 * token, `--of-control-border`, measured against the panel and never against
 * a card: 2.26:1 on the default card After Hours and under 3:1 on seven card
 * colours in the Notebook. An edge drawn from the card's own ink follows
 * whatever paper it is on, and this measures it on every one.
 *
 * The share is read from the stylesheet, and the edge composited over the
 * paper exactly as `color-mix(in srgb, currentcolor N%, transparent)` is.
 */
describe.each(THEMES)("a poll's controls — $name", ({ token }) => {
  const share = (selector: string): number => {
    const body = new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`).exec(CSS)?.[1] ?? ''
    const found = /border:[^;]*color-mix\(in srgb, currentcolor (\d+)%, transparent\)/.exec(body)
    expect(found, `${selector} draws its edge from the card's ink`).not.toBeNull()
    return Number(found?.[1] ?? 0) / 100
  }
  const over = (ink: string, paper: string, amount: number): string => {
    const [ir, ig, ib] = channels(ink)
    const [pr, pg, pb] = channels(paper)
    const mix = (i: number, p: number) => Math.round(i * amount + p * (1 - amount))
    const hex = (n: number) => n.toString(16).padStart(2, '0')
    return `#${hex(mix(ir, pr))}${hex(mix(ig, pg))}${hex(mix(ib, pb))}`
  }
  // The pairs the card can be drawn in: what `readableInkOn` gives a neutral
  // card, and the board's ink on every hue.
  const cards: readonly (readonly [string, string, string])[] = [
    ['white', token('s-white'), token('c-black')],
    ['black', token('s-black'), token('c-white')],
    ...HUES.map((hue) => [hue, token(`s-${hue}`), token('ink')] as const),
  ]

  it.each(['of-poll__option', 'of-poll__close'])('%s shows on every card (3:1)', (selector) => {
    const amount = share(selector)
    const faint = cards
      .map(([name, paper, ink]) => [name, contrast(over(ink, paper, amount), paper)] as const)
      .filter(([, ratio]) => ratio < 3)
    expect(faint).toEqual([])
  })
})
