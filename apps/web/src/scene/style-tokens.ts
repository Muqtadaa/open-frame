import { isColorToken, type AlignToken, type ColorToken, type ColorValue, type DashToken, type FontToken,
  type VAlignToken,
  type StrokeToken,
} from '@openframe/core'

/**
 * The one place design tokens become CSS values.
 *
 * Documents store token NAMES, never colours, so this mapping is what makes
 * theming possible later without rewriting a single board. Every view reads
 * from here rather than hard-coding a hex value.
 */
export const COLOR_VARS: Record<ColorToken, string> = {
  black: 'var(--of-c-black)',
  white: 'var(--of-c-white)',
  pink: 'var(--of-c-pink)',
  brown: 'var(--of-c-brown)',
  yellow: 'var(--of-c-yellow)',
  green: 'var(--of-c-green)',
  blue: 'var(--of-c-blue)',
  red: 'var(--of-c-red)',
  violet: 'var(--of-c-violet)',
  orange: 'var(--of-c-orange)',
  gray: 'var(--of-c-gray)',
}

export const SURFACE_VARS: Record<ColorToken, string> = {
  black: 'var(--of-s-black)',
  white: 'var(--of-s-white)',
  pink: 'var(--of-s-pink)',
  brown: 'var(--of-s-brown)',
  yellow: 'var(--of-s-yellow)',
  green: 'var(--of-s-green)',
  blue: 'var(--of-s-blue)',
  red: 'var(--of-s-red)',
  violet: 'var(--of-s-violet)',
  orange: 'var(--of-s-orange)',
  gray: 'var(--of-s-gray)',
}

/**
 * A colour, as CSS.
 *
 * A TOKEN goes through the map above, so it follows the theme. A LITERAL is
 * handed over as written, which is the whole point of picking one — and is
 * also why a literal does not follow a theme: there is no second value to
 * switch to. `ObjectStyle` says so, the picker warns about contrast while you
 * are choosing, and nothing here quietly adjusts what somebody picked.
 *
 * Two resolvers rather than one, because a token means two different colours
 * depending on the job: `blue` is a deep ink to write with and a pale wash to
 * stand on. A literal is the same colour in both, since the user picked it in
 * the control that does the job they wanted.
 */
export function inkOf(value: ColorValue | undefined, fallback: ColorToken = 'gray'): string {
  if (value === undefined) return COLOR_VARS[fallback]
  return isColorToken(value) ? COLOR_VARS[value] : value
}

export function surfaceOf(value: ColorValue | undefined, fallback: ColorToken): string {
  if (value === undefined) return SURFACE_VARS[fallback]
  return isColorToken(value) ? SURFACE_VARS[value] : value
}

/**
 * The ink of an object's text, or `undefined` to inherit the board's own.
 *
 * `undefined` rather than a default token on purpose: a note whose text nobody
 * has coloured should read as the board reads, and pinning it to `gray` here
 * would freeze today's ink into every object the moment a theme changed it —
 * `inherit` is not a value CSS can be handed, so the property goes unset.
 */
/**
 * What each stroke token is worth, in world units.
 *
 * ONE table. It was written out twice — a const in `ConnectorView` and an
 * inline object literal in `ShapeView` — and a third copy was about to go into
 * `ImageView`. Three transcriptions of four numbers is three chances for a
 * thick line to mean something different depending on what it is drawn on.
 */
export const STROKE_WIDTHS: Readonly<Record<StrokeToken, number>> = {
  none: 0,
  thin: 1,
  medium: 2,
  thick: 4,
}

/**
 * The width a stroke token draws at, with the caller's own default.
 *
 * The default is the caller's because it differs and should: a shape and a
 * connector are lines by nature and default to `medium`, while an image is not
 * and must default to `none` — giving every image already on a board a border
 * nobody asked for is not a new feature, it is a change to their work.
 */
export function strokeWidth(token: StrokeToken | undefined, fallback: StrokeToken): number {
  return STROKE_WIDTHS[token ?? fallback]
}

export function inkColor(value: ColorValue | undefined): string | undefined {
  return value === undefined ? undefined : inkOf(value)
}

/**
 * Ink that can be read on a given fill, when nobody has chosen one.
 *
 * Only two tokens need it, and they are the two that mean themselves rather
 * than naming a hue: a `black` fill needs light text and a `white` fill needs
 * dark text, in BOTH worlds. Every other token is a pale slip in the day and a
 * deep one at night, and in both cases the board's own ink is already the
 * right colour — so the answer is `undefined` and the text simply inherits.
 *
 * A LITERAL is arithmetic on six hex digits, which is cheap enough to do while
 * rendering. What this never does is ask for a computed style: resolving
 * `var(--of-s-black)` against the document is a layout read, and this is
 * called once per object per frame.
 */
export function readableInkOn(fill: ColorValue | undefined): string | undefined {
  if (fill === undefined) return undefined
  if (fill === 'black') return COLOR_VARS.white
  if (fill === 'white') return COLOR_VARS.black
  if (isColorToken(fill)) return undefined
  return relativeLuminance(fill) < 0.4 ? COLOR_VARS.white : COLOR_VARS.black
}

/**
 * WCAG relative luminance, for a literal.
 *
 * The threshold above is 0.4 rather than the midpoint: sRGB luminance is
 * perceptual, and a colour has to be quite light before dark text beats light
 * text on it. At 0.5 a mid blue took black text and was worse for it.
 */
function relativeLuminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
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
/**
 * Vertical alignment, as a flex cross-axis value.
 *
 * `start` is the default and is left UNSET rather than written out: an absent
 * property is what lets a view's own stylesheet decide, and a table cell and a
 * sticky do not start from the same place.
 */
export function verticalAlign(token: VAlignToken | undefined): 'flex-start' | 'center' | 'flex-end' {
  return token === 'middle' ? 'center' : token === 'bottom' ? 'flex-end' : 'flex-start'
}

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
