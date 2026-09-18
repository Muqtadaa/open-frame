import { type ZodType, z } from 'zod'

import { RichTextSchema, type RichText } from '../../domain/rich-text.js'

/**
 * A claim the board makes, standing on evidence.
 *
 * The difference between this and a sticky note that happens to say the same
 * words is that an insight can be asked what it stands on — which is what the
 * relation objects joining it to its evidence answer (ADR 0011). The claim
 * itself is just text; the provenance is not stored here, deliberately, because
 * an array of ids on this object would lose a citation whenever two people
 * added one at the same time.
 */
export interface InsightData {
  readonly text: RichText
  /**
   * How well supported the claim is, in the author's judgement.
   *
   * `unstated` rather than a missing value or a default of "medium": structure
   * is earned, and a confidence nobody set must not read as one somebody did.
   * It is the author's assessment, never derived from how many relations point
   * at the insight — three weak citations are not a strong claim, and a product
   * that computed this would be asserting something it cannot know.
   */
  readonly confidence: Confidence
}

export const CONFIDENCE_LEVELS = ['unstated', 'low', 'medium', 'high'] as const
export type Confidence = (typeof CONFIDENCE_LEVELS)[number]

export const INSIGHT_VERSION = 2

export const InsightDataSchema: ZodType<InsightData> = z
  .object({
    text: RichTextSchema,
    confidence: z.enum(CONFIDENCE_LEVELS),
  })
  .strict()
