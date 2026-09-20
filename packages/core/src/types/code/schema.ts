import { type ZodType, z } from 'zod'

/**
 * A block of code, kept exactly as it was pasted.
 *
 * PLAIN TEXT, not rich text, and that is the whole point of the type. Code's
 * meaning is in its characters and its indentation; a rich-text model would
 * offer bold and alignment, which mean nothing here, and would mangle the
 * whitespace that does. A board holds code as evidence — something somebody
 * pasted to point at — far more often than as something being written.
 */
export interface CodeData {
  readonly code: string
  /**
   * What to highlight it as.
   *
   * A plain string rather than a union of the languages a highlighter happens
   * to support: the list belongs to the highlighter, it changes when the
   * highlighter is swapped, and a board written today must still open when it
   * does. An unrecognised language renders unhighlighted, which is exactly
   * what `plain` does.
   */
  readonly language: string
}

export const CODE_VERSION = 1

/**
 * Enough for a file, not enough for a repository.
 *
 * A board is not a place to store a codebase, and an unbounded string here is
 * an unbounded row in every client's memory and every message on the wire.
 */
export const MAX_CODE = 20_000

/** The languages the picker offers. NOT what the schema accepts. */
export const CODE_LANGUAGES = [
  'plain',
  'bash',
  'css',
  'html',
  'json',
  'python',
  'sql',
  'typescript',
] as const

export const CodeDataSchema: ZodType<CodeData> = z.object({
  code: z.string().max(MAX_CODE),
  /*
   * Bounded and pattern-checked, because it reaches a highlighter and ends up
   * in a class name. Anything outside this is not a language, and refusing it
   * here is cheaper than trusting every consumer to be careful.
   */
  language: z
    .string()
    .max(32)
    .regex(/^[a-z0-9+#-]*$/),
})
