import { type ZodType, z } from 'zod'

import type { ObjectId } from '../../domain/ids.js'

/**
 * Who made a mark: a reaction, a vote.
 *
 * `key` is the person's stable key — derived from their account when they are
 * signed in, kept by their browser when they are a guest — and is what "my
 * reaction" is matched on. `name` and `hue` are how they appeared at the time,
 * so a reaction still says who left it after that person has gone.
 *
 * Self-asserted, like a guest's name in presence: the room admits writers by
 * link and never by identity (ADR 0016), so this is attribution, not proof.
 */
export interface MarkAuthor {
  readonly key: string
  readonly name: string
  readonly hue: number
}

export const MarkAuthorSchema: ZodType<MarkAuthor> = z
  .object({
    key: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
    // One line wherever it is shown — a chip's tip, a list of who voted — and
    // a tab or newline inside it once read as a field or a record of its own.
    name: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^[^\p{Cc}]+$/u),
    hue: z.number().finite().min(0).max(360),
  })
  .strict()

/**
 * One person's reaction to one object.
 *
 * An object of its own rather than an entry in the note's data, for the reason
 * relations are (ADR 0011): a board merges object by object, so two people
 * reacting to the same note at the same moment would each write the whole note
 * and one reaction would be lost. Two reaction objects are two `add` patches.
 *
 * No geometry: `spatial: false`, like a relation. It is drawn as part of the
 * note it is on.
 */
export interface ReactionData {
  readonly target: ObjectId
  /**
   * A palette key — `plus-one`, `heart`, `idea` — rather than an emoji. The
   * interface owns how a key looks, and a newer key an older build has not
   * met is still a valid reaction it can count, rather than a reason to
   * refuse the object.
   */
  readonly glyph: string
  readonly by: MarkAuthor
}

export const REACTION_VERSION = 1

/** What a glyph key may look like: short, lower-case, and never markup. */
export const GLYPH_PATTERN = /^[a-z0-9-]{1,24}$/

export const ReactionDataSchema: ZodType<ReactionData> = z
  .object({
    target: z.string().min(1),
    glyph: z.string().regex(GLYPH_PATTERN),
    by: MarkAuthorSchema,
  })
  .strict() as unknown as ZodType<ReactionData>
