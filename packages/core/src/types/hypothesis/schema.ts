import { type ZodType, z } from 'zod'

import { RichTextSchema, type RichText } from '../../domain/rich-text.js'

/**
 * A testable prediction, standing on an insight.
 *
 * The difference between this and an insight is falsifiability: an insight says
 * what is true of the evidence, a hypothesis says what would happen if you
 * acted on it. That is why it carries a status an experiment can settle.
 */
export interface HypothesisData {
  readonly text: RichText
  /**
   * How the evidence has landed so far.

   * `untested` rather than a missing value: a hypothesis nobody has tested is
   * a different thing from one whose result was never recorded, and only the
   * author knows which. It is never derived from whether an experiment points
   * at it — a finished experiment can be inconclusive.
   */
  readonly status: HypothesisStatus
}

export const HYPOTHESIS_STATUS = ['untested', 'supported', 'refuted', 'inconclusive'] as const
export type HypothesisStatus = (typeof HYPOTHESIS_STATUS)[number]

export const HYPOTHESIS_VERSION = 1

export const HypothesisDataSchema: ZodType<HypothesisData> = z
  .object({
    text: RichTextSchema,
    status: z.enum(HYPOTHESIS_STATUS),
  })
  .strict()
