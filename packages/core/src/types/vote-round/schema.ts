import { type ZodType, z } from 'zod'

import type { ObjectId } from '../../domain/ids.js'
import { MarkAuthorSchema, type MarkAuthor } from '../reaction/schema.js'

/**
 * Which notes a round's votes may go on: the whole board, what a frame holds,
 * or the notes that were selected when it started.
 */
export type VoteScope =
  | { readonly kind: 'board' }
  | { readonly kind: 'frame'; readonly frame: ObjectId }
  | { readonly kind: 'objects'; readonly ids: readonly ObjectId[] }

export type VoteRoundStatus = 'open' | 'closed'

/**
 * A round of dot voting: everybody gets the same number of dots to put on the
 * notes in scope.
 *
 * In the board, like a vote, so it is shared, saved and undone like anything
 * else — but not on it: `spatial: false`. There is one round on a board at a
 * time, which is all a session runs and keeps "the" round unambiguous for
 * everybody looking at it.
 */
export interface VoteRoundData {
  readonly title: string
  readonly scope: VoteScope
  /** Dots each person may place. */
  readonly perPerson: number
  /**
   * Counts are kept from everybody but their own dots until revealed. Hidden
   * by the INTERFACE only: the votes are objects on the board like any other,
   * and anybody who reads the document can count them.
   */
  readonly hidden: boolean
  readonly status: VoteRoundStatus
  /** Which round of the board's this is, counting from 1; it is what names it. */
  readonly run: number
  readonly by: MarkAuthor
}

export const VOTE_ROUND_VERSION = 1
export const MAX_VOTES_PER_PERSON = 20
/** Matches what one command may touch; a scope larger than that came from no selection. */
export const MAX_SCOPE_IDS = 500

const ScopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('board') }),
  z.strictObject({ kind: z.literal('frame'), frame: z.string().min(1) }),
  z.strictObject({
    kind: z.literal('objects'),
    ids: z.array(z.string().min(1)).min(1).max(MAX_SCOPE_IDS),
  }),
])

export const VoteRoundDataSchema: ZodType<VoteRoundData> = z.strictObject({
  title: z
    .string()
    .trim()
    .max(80)
    .regex(/^[^\p{Cc}]*$/u),
  scope: ScopeSchema,
  perPerson: z.number().int().min(1).max(MAX_VOTES_PER_PERSON),
  hidden: z.boolean(),
  status: z.enum(['open', 'closed']),
  run: z.number().int().min(1),
  by: MarkAuthorSchema,
}) as unknown as ZodType<VoteRoundData>
