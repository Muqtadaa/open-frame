import { type ZodType, z } from 'zod'

import { RichTextSchema, type RichText } from '../../domain/rich-text.js'

/**
 * A choice the team made, with the reason it made it.
 *
 * The rationale is the payload. A decision without one is a statement of fact
 * that nobody can revisit — and revisiting is the whole reason a board is
 * returned to weeks later by someone who was not there.
 */
export interface DecisionData {
  readonly text: RichText
  readonly rationale: string
  /**
   * `superseded` rather than deleting the decision. What was decided
   * and later reversed is the most useful thing on a board of this kind, and
   * a model that only holds current decisions cannot say it.
   */
  readonly status: DecisionStatus
}

export const DECISION_STATUS = ['proposed', 'accepted', 'superseded'] as const
export type DecisionStatus = (typeof DECISION_STATUS)[number]

export const DECISION_VERSION = 1

export const DecisionDataSchema: ZodType<DecisionData> = z
  .object({
    text: RichTextSchema,
    rationale: z.string(),
    status: z.enum(DECISION_STATUS),
  })
  .strict()
