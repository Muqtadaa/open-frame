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
 * Style is expressed in DESIGN TOKENS, never raw colours.
 *
 * Tokens keep theming possible, keep documents small, keep "make this red"
 * expressible by an AI command, and stop the document from encoding one
 * particular visual design forever.
 *
 * The record is sparse: an absent key means "this type's default", not a value.
 * Each object type declares which of these it honours via `capabilities.styleProps`,
 * so a style command can apply across a heterogeneous selection without ever
 * switching on the object's type.
 */
export interface ObjectStyle {
  readonly color?: ColorToken
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

export const COLOR_TOKENS = ['gray', 'yellow', 'green', 'blue', 'red', 'violet', 'orange'] as const
export const FILL_TOKENS = ['none', 'tint', 'solid'] as const
export const STROKE_TOKENS = ['none', 'thin', 'medium', 'thick'] as const
export const DASH_TOKENS = ['solid', 'dashed', 'dotted'] as const
export const FONT_TOKENS = ['sans', 'serif', 'mono'] as const
export const ALIGN_TOKENS = ['start', 'center', 'end'] as const
export const RADIUS_TOKENS = ['none', 'small', 'medium', 'large'] as const

export type ColorToken = (typeof COLOR_TOKENS)[number]
export type FillToken = (typeof FILL_TOKENS)[number]
export type StrokeToken = (typeof STROKE_TOKENS)[number]
export type DashToken = (typeof DASH_TOKENS)[number]
export type FontToken = (typeof FONT_TOKENS)[number]
export type AlignToken = (typeof ALIGN_TOKENS)[number]
export type RadiusToken = (typeof RADIUS_TOKENS)[number]

export type StyleProp = keyof ObjectStyle

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
