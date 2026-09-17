import { type ZodType, z } from 'zod'

/**
 * Free text on the canvas — no card, no background, just words in space.
 *
 * Distinct from `sticky` rather than a style variant of it: a sticky note is a
 * unit of content that gets clustered and counted, whereas text is a label or
 * heading that annotates the board. Tools, AI clustering and future search all
 * want to tell those apart, and a style flag cannot carry that meaning.
 */
export interface TextData {
  readonly text: string
}

export const TEXT_VERSION = 1

export const TextDataSchema: ZodType<TextData> = z.object({
  text: z.string(),
})
