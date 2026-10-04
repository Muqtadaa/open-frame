import { type ZodType, z } from 'zod'

import type { ObjectId } from '../../domain/ids.js'
import { MarkAuthorSchema, type MarkAuthor } from '../reaction/schema.js'

/**
 * One dot, by one person, on one note, in one round.
 *
 * An object of its own for the reason a reaction is (ADR 0011): two people
 * voting on the same note at the same moment are two `add` patches, where a
 * count inside the note would lose one of them.
 */
export interface VoteData {
  readonly target: ObjectId
  readonly round: ObjectId
  readonly by: MarkAuthor
}

export const VOTE_VERSION = 1

export const VoteDataSchema: ZodType<VoteData> = z.strictObject({
  target: z.string().min(1),
  round: z.string().min(1),
  by: MarkAuthorSchema,
}) as unknown as ZodType<VoteData>
