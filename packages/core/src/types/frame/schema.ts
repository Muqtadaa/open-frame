import { type ZodType, z } from 'zod'

import { RichTextSchema, type RichText } from '../../domain/rich-text.js'

/**
 * A named region that holds other objects.
 *
 * The first type with `canHaveChildren`, and therefore the first real exercise
 * of `parentId`, the cycle guard and cascade delete — all of which were built
 * in Phase 1 and had no caller until now.
 *
 * Note the name: `FrameData` is the payload of a `frame` OBJECT. `ObjectFrame`
 * is the geometry every object has. Unfortunate collision, kept because both
 * names are what users and developers actually say.
 */
export interface FrameData {
  /** Rich text since v2 (ADR 0014): a title takes marks, sizes and lists like a note. */
  readonly name: RichText
}

export const FRAME_VERSION = 2

export const FrameDataSchema: ZodType<FrameData> = z.object({
  name: RichTextSchema,
})
