import { type ZodType, z } from 'zod'

/**
 * The simplest possible semantic payload — deliberately.
 *
 * `sticky` exists in Phase 1 to prove the architecture end to end, not to be
 * feature-complete. Richer types (`evidence`, `insight`, `experiment`) are
 * added the same way, without touching anything outside their own folder.
 */
export interface StickyData {
  readonly text: string
}

export const STICKY_VERSION = 1

export const StickyDataSchema: ZodType<StickyData> = z.object({
  text: z.string(),
})
