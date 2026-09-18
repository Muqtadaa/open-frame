import { type ZodType, z } from 'zod'

import { RichTextSchema, type RichText } from '../../domain/rich-text.js'

/**
 * A test someone is running, or ran, against a hypothesis.
 *
 * `method` is free text on purpose. "A/B test", "moderated usability study",
 * "five-second test" and "ask the support team" are all real answers, and a
 * closed list would be wrong for somebody within a week.
 */
export interface ExperimentData {
  readonly text: RichText
  readonly method: string
  /**
   * `abandoned` is a real outcome and is listed as one. An experiment
   * that was dropped is information about the team's priorities, and a status
   * list without it invites people to leave it as `running` forever.
   */
  readonly status: ExperimentStatus
}

export const EXPERIMENT_STATUS = ['planned', 'running', 'complete', 'abandoned'] as const
export type ExperimentStatus = (typeof EXPERIMENT_STATUS)[number]

export const EXPERIMENT_VERSION = 1

export const ExperimentDataSchema: ZodType<ExperimentData> = z
  .object({
    text: RichTextSchema,
    method: z.string(),
    status: z.enum(EXPERIMENT_STATUS),
  })
  .strict()
