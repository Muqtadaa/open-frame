import type { AssetRef, BoardDocument } from '../domain/document.js'
import { asAssetId, asBoardId, asObjectId, asOrderKey, asUserId } from '../domain/ids.js'
import type { AssetId, ObjectId } from '../domain/ids.js'
import { repairDocument, type Repair } from '../domain/invariants.js'
import {
  ORIGINS,
  type AnyOpenFrameObject,
  type ObjectStyle,
  type Origin,
} from '../domain/object.js'
import type { ObjectTypeRegistry } from '../domain/registry.js'
import { UNKNOWN_TYPE } from '../types/unknown/definition.js'
import {
  PersistedBoardPayloadSchema,
  PersistedBoardSchema,
  type PersistedObject,
} from './envelope.js'
import { migrateDocumentPayload } from './migrations/index.js'
import { CURRENT_SCHEMA_VERSION } from './version.js'

/**
 * Why a document could not be opened normally.
 *
 * Every one of these results in a READ-ONLY board plus the raw payload, never
 * in a partial load that gets written back. Overwriting a document you could
 * not fully read destroys a user's work permanently — so the load path is
 * allowed to fail, but it is never allowed to save.
 */
export type QuarantineReason =
  'unparseable' | 'invalid-envelope' | 'newer-schema' | 'migration-failed' | 'invalid-payload'

/** An object this build could not interpret, preserved rather than dropped. */
export interface DegradedObject {
  readonly id: ObjectId
  readonly originalType: string
  readonly reason: 'unknown-type' | 'invalid-data' | 'migration-failed'
  readonly detail: string
}

export type LoadResult =
  | {
      readonly status: 'ok'
      readonly document: BoardDocument
      readonly repairs: readonly Repair[]
      readonly degraded: readonly DegradedObject[]
    }
  | {
      readonly status: 'quarantined'
      readonly reason: QuarantineReason
      readonly message: string
      readonly raw: unknown
    }

function toOrigin(value: string): Origin {
  return (ORIGINS as readonly string[]).includes(value) ? (value as Origin) : 'import'
}

function toStyle(json: Record<string, unknown>): ObjectStyle {
  const style: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(json)) {
    if (value !== undefined) style[key] = value
  }
  // Style tokens are validated per-type; unrecognised keys are inert, not fatal.
  return style
}

function quarantineObject(
  persisted: PersistedObject,
  registry: ObjectTypeRegistry,
): AnyOpenFrameObject {
  const definition = registry.require(UNKNOWN_TYPE)
  const { data } = definition.create({
    originalType: persisted.type,
    originalVersion: persisted.dataVersion,
    raw: persisted.data,
  })
  return {
    id: asObjectId(persisted.id),
    type: UNKNOWN_TYPE,
    dataVersion: definition.currentVersion,
    frame: { ...persisted.frame },
    parentId: persisted.parentId === null ? null : asObjectId(persisted.parentId),
    order: asOrderKey(persisted.order),
    style: toStyle(persisted.style),
    locked: persisted.locked,
    hidden: persisted.hidden,
    data,
    meta: {
      createdAt: persisted.meta.createdAt,
      createdBy: persisted.meta.createdBy === null ? null : asUserId(persisted.meta.createdBy),
      createdVia: toOrigin(persisted.meta.createdVia),
      ...(persisted.meta.tags === undefined ? {} : { tags: persisted.meta.tags }),
    },
  }
}

/**
 * The load pipeline.
 *
 * parse -> validate envelope -> version gate -> migrate -> validate payload ->
 * per-object migrate and validate -> repair invariants.
 *
 * A failure at the document level quarantines the whole board. A failure at a
 * single OBJECT degrades only that object: it becomes an `unknown` placeholder
 * and everything else on the board opens normally. One malformed sticky note
 * must never cost a user access to a workshop.
 */
export function deserializeBoard(raw: unknown, registry: ObjectTypeRegistry): LoadResult {
  const envelope = PersistedBoardSchema.safeParse(raw)
  if (!envelope.success) {
    return {
      status: 'quarantined',
      reason: 'invalid-envelope',
      message: envelope.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      raw,
    }
  }

  if (envelope.data.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return {
      status: 'quarantined',
      reason: 'newer-schema',
      message: `Board was saved by a newer version of OpenFrame (schema ${envelope.data.schemaVersion}, this build supports ${CURRENT_SCHEMA_VERSION}).`,
      raw,
    }
  }

  let migrated: unknown
  try {
    migrated = migrateDocumentPayload(
      envelope.data.board,
      envelope.data.schemaVersion,
      CURRENT_SCHEMA_VERSION,
    )
  } catch (error) {
    return {
      status: 'quarantined',
      reason: 'migration-failed',
      message: error instanceof Error ? error.message : String(error),
      raw,
    }
  }

  const payload = PersistedBoardPayloadSchema.safeParse(migrated)
  if (!payload.success) {
    return {
      status: 'quarantined',
      reason: 'invalid-payload',
      message: payload.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      raw,
    }
  }

  const objects = new Map<ObjectId, AnyOpenFrameObject>()
  const degraded: DegradedObject[] = []

  for (const persisted of payload.data.objects) {
    const id = asObjectId(persisted.id)
    const definition = registry.get(persisted.type)

    if (definition === undefined) {
      objects.set(id, quarantineObject(persisted, registry))
      degraded.push({
        id,
        originalType: persisted.type,
        reason: 'unknown-type',
        detail: `This build has no definition for object type "${persisted.type}".`,
      })
      continue
    }

    let data: unknown
    try {
      data = definition.migrate(persisted.data, persisted.dataVersion)
    } catch (error) {
      objects.set(id, quarantineObject(persisted, registry))
      degraded.push({
        id,
        originalType: persisted.type,
        reason: 'migration-failed',
        detail: error instanceof Error ? error.message : String(error),
      })
      continue
    }

    const validated = definition.validate(data)
    if (!validated.ok) {
      objects.set(id, quarantineObject(persisted, registry))
      degraded.push({
        id,
        originalType: persisted.type,
        reason: 'invalid-data',
        detail: validated.issues.join('; '),
      })
      continue
    }

    objects.set(id, {
      id,
      type: persisted.type,
      dataVersion: definition.currentVersion,
      frame: { ...persisted.frame },
      parentId: persisted.parentId === null ? null : asObjectId(persisted.parentId),
      order: asOrderKey(persisted.order),
      style: toStyle(persisted.style),
      locked: persisted.locked,
      hidden: persisted.hidden,
      data: validated.data,
      meta: {
        createdAt: persisted.meta.createdAt,
        createdBy: persisted.meta.createdBy === null ? null : asUserId(persisted.meta.createdBy),
        createdVia: toOrigin(persisted.meta.createdVia),
        ...(persisted.meta.tags === undefined ? {} : { tags: persisted.meta.tags }),
      },
    })
  }

  const assets = new Map<AssetId, AssetRef>()
  for (const asset of payload.data.assets) {
    const id = asAssetId(asset.id)
    assets.set(id, {
      id,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      ...(asset.width === undefined ? {} : { width: asset.width }),
      ...(asset.height === undefined ? {} : { height: asset.height }),
      locator: asset.locator,
    })
  }

  const { document, repairs } = repairDocument({
    id: asBoardId(payload.data.id),
    objects,
    assets,
    meta: { title: payload.data.meta.title, createdAt: payload.data.meta.createdAt },
  })

  return { status: 'ok', document, repairs, degraded }
}

/** Convenience for the common case of loading from a JSON string. */
export function deserializeBoardJson(json: string, registry: ObjectTypeRegistry): LoadResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (error) {
    return {
      status: 'quarantined',
      reason: 'unparseable',
      message: error instanceof Error ? error.message : String(error),
      raw: json,
    }
  }
  return deserializeBoard(parsed, registry)
}
