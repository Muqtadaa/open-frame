import { type ZodType, z } from 'zod'

import type { ObjectId } from '../../domain/ids.js'
import { POLL_OPTION_ID } from '../poll/schema.js'
import { MarkAuthorSchema, type MarkAuthor } from '../reaction/schema.js'

/** One person's pick of one option on one poll. */
export interface PollAnswerData {
  readonly poll: ObjectId
  readonly option: string
  readonly by: MarkAuthor
}

export const POLL_ANSWER_VERSION = 1

export const PollAnswerDataSchema: ZodType<PollAnswerData> = z.strictObject({
  poll: z.string().min(1),
  option: z.string().regex(POLL_OPTION_ID),
  by: MarkAuthorSchema,
}) as unknown as ZodType<PollAnswerData>
