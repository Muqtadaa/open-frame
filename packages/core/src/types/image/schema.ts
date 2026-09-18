import { type ZodType, z } from 'zod'

import type { AssetRef } from '../../domain/document.js'

/**
 * An image on the board.
 *
 * Holds a REFERENCE, never the bytes. Embedding image data in the document
 * would bloat every save, every undo entry and — later — every collaborative
 * update, for content that never changes after upload.
 *
 * The whole `AssetRef` is stored here rather than an id pointing into
 * `BoardDocument.assets`, for one blunt reason: a `Patch` addresses an
 * `ObjectId`, so there is no way to add an entry to that map through the
 * command layer without widening the change format — and a wider change format
 * is a cost paid by the collaboration adapter, undo and serialization forever.
 *
 * The map would also not have bought what it looks like it buys. Deciding which
 * assets are still referenced means walking the objects either way, so it never
 * removed the need for a scan. What it costs instead is a few duplicated fields
 * per image, which also happen to make an image self-contained: copying one
 * between boards carries everything needed to find its bytes.
 */
export interface ImageData {
  readonly asset: AssetRef
  /**
   * Intrinsic pixel size. Kept separate from the frame, which is the placed
   * size, so aspect ratio survives any amount of resizing.
   */
  readonly naturalWidth: number
  readonly naturalHeight: number
  /** Alternative text. Empty is allowed; absent is not. */
  readonly alt: string
}

export const IMAGE_VERSION = 1

const AssetRefSchema = z.object({
  id: z.string().min(1),
  mimeType: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  locator: z.string().min(1),
})

export const ImageDataSchema: ZodType<ImageData> = z.object({
  asset: AssetRefSchema,
  naturalWidth: z.number().positive(),
  naturalHeight: z.number().positive(),
  alt: z.string(),
}) as unknown as ZodType<ImageData>
