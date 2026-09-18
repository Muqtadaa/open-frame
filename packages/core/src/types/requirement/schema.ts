import { type ZodType, z } from 'zod'

import { RichTextSchema, type RichText } from '../../domain/rich-text.js'

/**
 * Something the thing being built must do.
 *
 * Priority is MoSCoW — must, should, could, won't — because it is the scheme
 * most of these users already argue in, and inventing a fourth ranking
 * vocabulary would make the board harder to read, not easier.
 */
export interface RequirementData {
  readonly text: RichText
  /**
   * `wont` is a decision, not an absence, which is exactly why MoSCoW
   * names it. `unset` is the absence, and they must not be the same value.
   */
  readonly priority: RequirementPriority
}

export const REQUIREMENT_PRIORITY = ['unset', 'must', 'should', 'could', 'wont'] as const
export type RequirementPriority = (typeof REQUIREMENT_PRIORITY)[number]

export const REQUIREMENT_VERSION = 1

export const RequirementDataSchema: ZodType<RequirementData> = z
  .object({
    text: RichTextSchema,
    priority: z.enum(REQUIREMENT_PRIORITY),
  })
  .strict()
