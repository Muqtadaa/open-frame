import { type ZodType, z } from 'zod'

/**
 * Geometric shapes, as ONE object type with a discriminant rather than four
 * registry entries.
 *
 * They share every behaviour — same capabilities, same style properties, same
 * editing, same description — and differ only in the path drawn. Four
 * definitions would be four copies of identical logic, and changing a shared
 * behaviour would mean editing all of them.
 *
 * The rule this expresses: a new registry entry is justified by different
 * BEHAVIOUR, not by different appearance. Contrast `text` vs `sticky`, which
 * look similar but mean different things.
 */
export const SHAPE_KINDS = ['rectangle', 'ellipse', 'triangle', 'diamond'] as const
export type ShapeKind = (typeof SHAPE_KINDS)[number]

export interface ShapeData {
  readonly shape: ShapeKind
  /** Shapes carry an optional label; empty is the common case. */
  readonly text: string
}

export const SHAPE_VERSION = 1

export const ShapeDataSchema: ZodType<ShapeData> = z.object({
  shape: z.enum(SHAPE_KINDS),
  text: z.string(),
})
