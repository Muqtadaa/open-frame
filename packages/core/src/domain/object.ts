import type { ObjectId, OrderKey, UserId } from './ids.js'

/**
 * Where an object sits on the canvas.
 *
 * Named `frame` rather than `transform` so it never gets confused with an
 * affine matrix. Rotation is stored but not yet honoured by any Phase 1 tool.
 */
export interface ObjectFrame {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** Radians, clockwise, about the frame's centre. */
  readonly rotation: number
}

/**
 * Style is expressed in DESIGN TOKENS, and a colour may also be literal.
 *
 * Tokens keep theming possible, keep documents small, keep "make this red"
 * expressible by an AI command, and stop the document from encoding one
 * particular visual design forever. They remain what every control offers
 * first and what every default is.
 *
 * A COLOUR may also be a `#rrggbb` the user picked off a wheel or an
 * eyedropper, because "the exact colour of that logo" is a real thing to want
 * and no fixed palette can answer it. What a literal costs is stated rather
 * than hidden: it does not follow a theme — a colour chosen on the light page
 * is that same colour in After Hours — and its contrast cannot be proven by a
 * build-time test the way a token pair is, so the picker warns while you are
 * choosing instead. Only colours may be literal; weights, dashes, fonts and
 * radii stay tokens, where a free value buys nothing and costs the same.
 *
 * The record is sparse: an absent key means "this type's default", not a value.
 * Each object type declares which of these it honours via `capabilities.styleProps`,
 * so a style command can apply across a heterogeneous selection without ever
 * switching on the object's type.
 */
export interface ObjectStyle {
  readonly color?: ColorValue
  /**
   * The ink of whatever text this object holds.
   *
   * SEPARATE from `color`, because on most types `color` is the object's
   * surface — a sticky's paper, a shape's fill, a frame's ground — and the
   * words on it are a different decision. Absent means the type's default
   * ink, which is the board's own, so a note keeps reading as a note until
   * somebody says otherwise.
   *
   * The two are not redundant even on a type where `color` IS the ink. A text
   * object declares `textColor` and not `color` for exactly that reason: one
   * control meaning one thing (rule 21). Before this, selecting a sticky and a
   * text together intersected on `color`, and the single "colour" swatch set
   * the note's paper and the text's ink at once.
   */
  readonly textColor?: ColorValue
  /**
   * The colour of this object's own line: a shape's outline, a connector, a
   * frame's edge, a table's rules.
   *
   * SEPARATE from `stroke`, which is the line's WEIGHT — the same split `dash`
   * already makes for its pattern. Three properties rather than one, because
   * they are chosen for different reasons and combine freely.
   *
   * Absent means the object's own `color`, which is what every stroke took
   * before this existed — so nothing drawn before it changes, and a shape
   * whose outline and fill were always one decision stays one decision until
   * somebody separates them.
   */
  readonly strokeColor?: ColorValue
  readonly fill?: FillToken
  readonly stroke?: StrokeToken
  /**
   * The line's pattern, separate from its weight.
   *
   * Two properties rather than one `dashed-thin` axis, because they are chosen
   * for different reasons and combine freely: weight is how loud a line is,
   * pattern is what it MEANS — a dashed connector conventionally reads as
   * provisional or inferred, at whatever weight suits the board.
   */
  readonly dash?: DashToken
  readonly font?: FontToken
  readonly align?: AlignToken
  /** 0..1 */
  readonly opacity?: number
  /**
   * How far a corner is rounded.
   *
   * A token rather than a number, like every other style property here: the
   * board has a visual system, and a free pixel value is how twelve shapes end
   * up with eleven different corners. Meaningless on a shape with no corners,
   * which is why the ellipse does not offer it — see `stylePropsFor`.
   */
  readonly radius?: RadiusToken
}

/**
 * The content palette, in the order the swatches are laid out.
 *
 * NEUTRALS FIRST, then the spectrum. Black, gray and white lead because they
 * are the ones somebody reaches for without thinking about hue at all, and a
 * palette that opens on yellow makes you hunt for them.
 *
 * `violet` IS the purple. It is not renamed, because documents store token
 * NAMES — every board ever saved holding `violet` would need a migration to
 * say `purple`, and a migration that only changes a spelling is a migration
 * that can only lose.
 *
 * Eleven, which no longer fits one row of the record panel. The swatches are a
 * deliberate 6x2 GRID rather than a row that happens to wrap; DESIGN.md's
 * objection was to the accidental 5+2, and a block that is obviously a block
 * reads as a palette.
 */
export const COLOR_TOKENS = [
  'black',
  'gray',
  'white',
  'red',
  'pink',
  'orange',
  'yellow',
  'green',
  'blue',
  'violet',
  'brown',
] as const
export const FILL_TOKENS = ['none', 'tint', 'solid'] as const
export const STROKE_TOKENS = ['none', 'thin', 'medium', 'thick'] as const
export const DASH_TOKENS = ['solid', 'dashed', 'dotted'] as const
export const FONT_TOKENS = ['sans', 'serif', 'mono'] as const
export const ALIGN_TOKENS = ['start', 'center', 'end'] as const
export const RADIUS_TOKENS = ['none', 'small', 'medium', 'large'] as const

export type ColorToken = (typeof COLOR_TOKENS)[number]

/**
 * A literal colour, as six hex digits.
 *
 * Six and not three, and no `rgb()` or named colour: one spelling means a
 * value can be compared, stored and shown back in the field it was typed into
 * without a normalising step that every reader would have to remember. The
 * picker writes this form and `parseHexColor` is the one place anything else
 * becomes it.
 */
export type HexColor = `#${string}`

const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** A colour anywhere in a style: a token, or the literal the user picked. */
export type ColorValue = ColorToken | HexColor

export function isColorToken(value: unknown): value is ColorToken {
  return typeof value === 'string' && (COLOR_TOKENS as readonly string[]).includes(value)
}

export function isHexColor(value: unknown): value is HexColor {
  return typeof value === 'string' && HEX_COLOR.test(value)
}

export function isColorValue(value: unknown): value is ColorValue {
  return isColorToken(value) || isHexColor(value)
}

/**
 * Anything a person might type into a colour field, as a `HexColor` — or
 * `null`, which is what an unfinished `#3a7` must be while they are still
 * typing it.
 *
 * Three digits expand rather than being refused, because `#f00` is what people
 * write and refusing it would be pedantry the field pays for. Case is
 * normalised DOWN so two spellings of the same colour are one value: without
 * that, `#FF0000` and `#ff0000` are different strings, and the swatch showing
 * "this one is selected" compares strings.
 */
export function parseHexColor(input: string): HexColor | null {
  const text = input.trim().toLowerCase()
  const body = text.startsWith('#') ? text.slice(1) : text
  if (/^[0-9a-f]{3}$/.test(body)) {
    const [r, g, b] = body
    return `#${String(r)}${String(r)}${String(g)}${String(g)}${String(b)}${String(b)}` as HexColor
  }
  return /^[0-9a-f]{6}$/.test(body) ? `#${body}` : null
}
export type FillToken = (typeof FILL_TOKENS)[number]
export type StrokeToken = (typeof STROKE_TOKENS)[number]
export type DashToken = (typeof DASH_TOKENS)[number]
export type FontToken = (typeof FONT_TOKENS)[number]
export type AlignToken = (typeof ALIGN_TOKENS)[number]
export type RadiusToken = (typeof RADIUS_TOKENS)[number]

export type StyleProp = keyof ObjectStyle

/**
 * Every style property, at runtime.
 *
 * `StyleProp` is `keyof ObjectStyle`, which exists only in the type system —
 * so anything needing the list at runtime used to write its own copy, and the
 * copy is what goes stale. `registry-contract.test.ts` held one, and adding a
 * corner radius broke it: the test was asserting against the properties the
 * app had when the test was written.
 *
 * The record is what makes this honest. `Record<StyleProp, true>` does not
 * compile until every key is present, so adding a property to `ObjectStyle`
 * forces it to be added here too — the same discipline capabilities follow.
 */
const EVERY_STYLE_PROP: Readonly<Record<StyleProp, true>> = {
  color: true,
  textColor: true,
  strokeColor: true,
  fill: true,
  stroke: true,
  dash: true,
  font: true,
  align: true,
  opacity: true,
  radius: true,
}

export const STYLE_PROPS = Object.keys(EVERY_STYLE_PROP) as readonly StyleProp[]

/** Who or what produced a change. Carried on every command, stored at creation. */
export const ORIGINS = ['user', 'ai', 'api', 'mcp', 'import', 'remote'] as const
export type Origin = (typeof ORIGINS)[number]

/**
 * CREATION provenance only.
 *
 * There is deliberately no `updatedAt` / `updatedBy` here. Stamping a shared
 * field on every mutation turns every edit into a write to contended state,
 * manufacturing merge conflicts between users who touched unrelated properties,
 * and inflating patch volume for data nothing in the render path reads.
 * "Last modified" for a board is derived at the persistence layer instead.
 * See docs/adr/0003-canonical-document-model.md.
 */
export interface ObjectMeta {
  readonly createdAt: number
  readonly createdBy: UserId | null
  readonly createdVia: Origin
  /** Namespaced, free-form. Never load-bearing for rendering or behaviour. */
  readonly tags?: Readonly<Record<string, string>>
}

/**
 * Every object on a board, of every type, has exactly this shape. Types differ
 * only in the `type` discriminant and the contents of `data`.
 *
 * A sticky note and a research `evidence` object are the same kind of thing to
 * the command layer, the renderer, persistence, undo and the spatial index.
 * That is what makes new semantic types cheap to add.
 */
export interface ObjectBase<TType extends string, TData> {
  readonly id: ObjectId
  readonly type: TType
  /**
   * The version of THIS TYPE's `data` shape — independent of the document
   * envelope version. An object type may evolve its payload without forcing a
   * whole-document migration.
   */
  readonly dataVersion: number
  readonly frame: ObjectFrame
  /** `null` means the board root. Cycles are an invariant violation. */
  readonly parentId: ObjectId | null
  readonly order: OrderKey
  readonly style: ObjectStyle
  /** Locked objects reject mutation at the command layer, not just in the UI. */
  readonly locked: boolean
  readonly hidden: boolean
  readonly data: TData
  readonly meta: ObjectMeta
}

/**
 * The type-erased view of an object, used by everything generic: the command
 * layer, patches, the store, culling, persistence.
 *
 * `unknown` for `data` is deliberate and is never widened to `any`: generic
 * code has no business reading a payload it cannot know the shape of. Anything
 * that does need to read it goes through the object type registry.
 */
export type AnyOpenFrameObject = ObjectBase<string, unknown>

export const DEFAULT_FRAME: ObjectFrame = Object.freeze({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  rotation: 0,
})
