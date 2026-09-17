import { type ZodType, z } from 'zod'

/**
 * The quarantine type for objects this build cannot interpret.
 *
 * A board saved by a newer OpenFrame, or containing a type behind a feature
 * flag, still opens: the unrecognised objects become `unknown`, render as a
 * labelled placeholder, and can be moved or deleted — but their original
 * payload is preserved verbatim and written back unchanged on save.
 *
 * This exists from day one rather than being retrofitted, because forward
 * compatibility that is not exercised from the start is forward compatibility
 * that does not work.
 */
export interface UnknownData {
  readonly originalType: string
  readonly originalVersion: number
  /** Preserved byte-for-byte. Never interpreted. */
  readonly raw?: unknown
}

export const UNKNOWN_VERSION = 1

export const UnknownDataSchema: ZodType<UnknownData> = z.object({
  originalType: z.string(),
  originalVersion: z.number(),
  raw: z.unknown(),
})
