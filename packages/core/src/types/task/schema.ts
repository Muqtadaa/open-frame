import { type ZodType, z } from 'zod'

import { RichTextSchema, type RichText } from '../../domain/rich-text.js'

/**
 * Work that follows from everything else on the board.
 *
 * Deliberately thin. This is not a tracker and will lose to one; it exists so
 * that "what do we do about it" can sit next to the evidence that produced it
 * rather than in a system nobody opens during a synthesis session.
 */
export interface TaskData {
  readonly text: RichText
  readonly assignee: string
  /**
   * `blocked` is distinct from `todo`: one is waiting on the person,
   * the other on something else, and a board that cannot say which loses the
   * only fact that makes a standup useful.
   */
  readonly status: TaskStatus
}

export const TASK_STATUS = ['todo', 'doing', 'done', 'blocked'] as const
export type TaskStatus = (typeof TASK_STATUS)[number]

export const TASK_VERSION = 1

export const TaskDataSchema: ZodType<TaskData> = z
  .object({
    text: RichTextSchema,
    assignee: z.string(),
    status: z.enum(TASK_STATUS),
  })
  .strict()
