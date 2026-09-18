import { type ZodType, z } from 'zod'

import { RichTextSchema, type RichText } from '../../domain/rich-text.js'

/**
 * The simplest possible semantic payload — deliberately.
 *
 * `sticky` exists in Phase 1 to prove the architecture end to end, not to be
 * feature-complete. Richer types (`evidence`, `insight`, `experiment`) are
 * added the same way, without touching anything outside their own folder.
 */
export interface StickyData {
  readonly text: RichText
}

export const STICKY_VERSION = 3

export const StickyDataSchema: ZodType<StickyData> = z.object({
  text: RichTextSchema,
})
