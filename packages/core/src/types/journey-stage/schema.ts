import { type ZodType, z } from 'zod'

import { RichTextSchema, type RichText } from '../../domain/rich-text.js'

/**
 * One step in a person's journey through a product or service.
 *
 * Its ORDER is spatial — stages are laid left to right, and the board is the
 * diagram — so there is no index field. Encoding position twice is how a
 * journey map ends up disagreeing with itself.
 */
export interface JourneyStageData {
  readonly text: RichText
  /**
   * How it feels to be at this stage.

   * `mixed` is separate from `neutral`, which is the distinction a journey map
   * exists to draw: an average of delight and frustration is not calm.
   */
  readonly sentiment: JourneyStageSentiment
}

export const JOURNEY_STAGE_SENTIMENT = [
  'unstated',
  'positive',
  'neutral',
  'negative',
  'mixed',
] as const
export type JourneyStageSentiment = (typeof JOURNEY_STAGE_SENTIMENT)[number]

export const JOURNEY_STAGE_VERSION = 1

export const JourneyStageDataSchema: ZodType<JourneyStageData> = z
  .object({
    text: RichTextSchema,
    sentiment: z.enum(JOURNEY_STAGE_SENTIMENT),
  })
  .strict()
