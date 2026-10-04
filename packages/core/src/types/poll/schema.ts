import { type ZodType, z } from 'zod'

import { RichTextSchema, type RichText } from '../../domain/rich-text.js'

/**
 * One option on a poll. The id is what an answer names, so editing the label
 * never moves anybody's answer to a different option.
 */
export interface PollOption {
  readonly id: string
  readonly label: string
}

/**
 * A question on the board with a fixed set of answers, answered on the card.
 *
 * The answers are not in here: each person's is an object of its own (see
 * `poll-answer`), for the reason a reaction is (ADR 0011) — two people
 * answering at the same moment would each write the whole poll, and one
 * answer would be lost.
 */
export interface PollData {
  readonly text: RichText
  readonly options: readonly PollOption[]
  /** Each person may pick several options rather than one. */
  readonly multi: boolean
  /**
   * Counts are kept from everybody but their own pick until the poll closes.
   * Hidden by the INTERFACE only: the answers are objects on the board.
   */
  readonly hideResults: boolean
  /** No more answers. The counts stay. */
  readonly closed: boolean
}

export const POLL_VERSION = 1
export const MIN_POLL_OPTIONS = 2
export const MAX_POLL_OPTIONS = 10
/**
 * `o1`, `o2` for the options a poll starts with, and a random tail for any
 * added later — never a number counted from the options there now, which
 * handed a removed option's id, and its uncounted answers, to the next one
 * added (Codex, on #66). Part of an answer's id, so kept plain.
 */
export const POLL_OPTION_ID = /^o[a-z0-9]{1,12}$/

const OptionSchema = z.strictObject({
  id: z.string().regex(POLL_OPTION_ID),
  label: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[^\p{Cc}]+$/u),
})

export const PollDataSchema: ZodType<PollData> = z
  .strictObject({
    text: RichTextSchema,
    options: z.array(OptionSchema).min(MIN_POLL_OPTIONS).max(MAX_POLL_OPTIONS),
    multi: z.boolean(),
    hideResults: z.boolean(),
    closed: z.boolean(),
  })
  .refine((data) => new Set(data.options.map((o) => o.id)).size === data.options.length, {
    message: 'Two options share an id',
  })
