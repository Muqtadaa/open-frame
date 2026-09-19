import { type ZodType, z } from 'zod'

import { RichTextSchema, type RichText } from '../../domain/rich-text.js'

/**
 * Geometric shapes, as ONE object type with a discriminant rather than four
 * registry entries.
 *
 * They share every behaviour — same capabilities, same style properties, same
 * editing, same description — and differ only in the path drawn. Eight
 * definitions would be eight copies of identical logic, and changing a shared
 * behaviour would mean editing all of them.
 *
 * Adding a kind needs no migration: an existing document's `shape` value stays
 * valid, and the version is unchanged. REMOVING one would be the opposite —
 * every board holding that kind would fail to parse — which is why the triangle
 * stayed when its label was the actual problem.
 *
 * The rule this expresses: a new registry entry is justified by different
 * BEHAVIOUR, not by different appearance. Contrast `text` vs `sticky`, which
 * look similar but mean different things.
 */
export const SHAPE_KINDS = [
  'rectangle',
  'ellipse',
  'triangle',
  'diamond',
  'hexagon',
  'trapezoid',
  'parallelogram',
  'octagon',
] as const
export type ShapeKind = (typeof SHAPE_KINDS)[number]

/**
 * Which kinds have corners, and therefore corners to round.
 *
 * A RECORD rather than `kind !== 'ellipse'`, so adding a kind does not compile
 * until it has stated its answer — the same discipline capabilities follow,
 * and for the same reason: a default here would let a new kind acquire a
 * control nobody chose for it, or lose one it should have had.
 *
 * The ellipse is the only false, and it is false because a radius means
 * nothing on it — not because it is awkward to draw.
 */
export const CORNERED_KINDS: Readonly<Record<ShapeKind, boolean>> = {
  rectangle: true,
  ellipse: false,
  triangle: true,
  diamond: true,
  hexagon: true,
  trapezoid: true,
  parallelogram: true,
  octagon: true,
}

export interface ShapeData {
  readonly shape: ShapeKind
  /** Shapes carry an optional label; empty is the common case. */
  readonly text: RichText
}

export const SHAPE_VERSION = 3

export const ShapeDataSchema: ZodType<ShapeData> = z.object({
  shape: z.enum(SHAPE_KINDS),
  text: RichTextSchema,
})
