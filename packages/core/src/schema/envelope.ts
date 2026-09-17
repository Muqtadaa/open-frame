import { z } from 'zod'

import { SCHEMA_FORMAT } from './version.js'

/**
 * The on-disk shapes.
 *
 * These are deliberately separate types from the domain model, and they are
 * plain JSON: no `Map`, no branded ids, no class instances. The domain is free
 * to change its in-memory representation without breaking every board ever
 * saved, and migrations have a stable target to write against.
 */

export const PersistedFrameSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number(),
})

export const PersistedMetaSchema = z.object({
  createdAt: z.number(),
  createdBy: z.string().nullable(),
  createdVia: z.string(),
  tags: z.record(z.string(), z.string()).optional(),
})

export const PersistedObjectSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  dataVersion: z.number().int().nonnegative(),
  frame: PersistedFrameSchema,
  parentId: z.string().nullable(),
  order: z.string().min(1),
  style: z.record(z.string(), z.unknown()),
  locked: z.boolean(),
  hidden: z.boolean(),
  /** Validated by the object type's own schema, not here. */
  data: z.unknown(),
  meta: PersistedMetaSchema,
})

export const PersistedAssetSchema = z.object({
  id: z.string().min(1),
  mimeType: z.string(),
  byteSize: z.number().int().nonnegative(),
  width: z.number().optional(),
  height: z.number().optional(),
  locator: z.string(),
})

export const PersistedBoardPayloadSchema = z.object({
  id: z.string().min(1),
  meta: z.object({ title: z.string(), createdAt: z.number() }),
  /** An array, not a keyed object: order is preserved and diffs stay readable. */
  objects: z.array(PersistedObjectSchema),
  assets: z.array(PersistedAssetSchema),
})

/**
 * The outermost wrapper. `board` stays `unknown` until migrations have run —
 * validating a v1 payload against today's schema would fail for every old
 * document, which is precisely the bug schema versioning exists to prevent.
 */
export const PersistedBoardSchema = z.object({
  format: z.literal(SCHEMA_FORMAT),
  schemaVersion: z.number().int().positive(),
  savedAt: z.number(),
  board: z.unknown(),
})

export type PersistedFrame = z.infer<typeof PersistedFrameSchema>
export type PersistedObject = z.infer<typeof PersistedObjectSchema>
export type PersistedAsset = z.infer<typeof PersistedAssetSchema>
export type PersistedBoardPayload = z.infer<typeof PersistedBoardPayloadSchema>
export type PersistedBoard = z.infer<typeof PersistedBoardSchema>
