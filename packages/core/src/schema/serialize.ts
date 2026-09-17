import type { BoardDocument } from '../domain/document.js'
import type { ObjectStyle } from '../domain/object.js'
import type { PersistedBoard, PersistedObject } from './envelope.js'
import { CURRENT_SCHEMA_VERSION, SCHEMA_FORMAT } from './version.js'

/** The shape `unknown`-type objects store. Read explicitly, never by index access. */
interface QuarantinedData {
  readonly originalType?: unknown
  readonly originalVersion?: unknown
  readonly raw?: unknown
}

function styleToJson(style: ObjectStyle): Record<string, unknown> {
  const json: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(style)) {
    if (value !== undefined) json[key] = value
  }
  return json
}

/**
 * Converts a live document to its on-disk form.
 *
 * `unknown` objects are written back under their ORIGINAL type and version with
 * their original payload, so a board round-trips losslessly through a build
 * that does not understand every type on it.
 */
export function serializeBoard(doc: BoardDocument, savedAt: number): PersistedBoard {
  const objects: PersistedObject[] = []

  for (const object of doc.objects.values()) {
    const isQuarantined = object.type === 'unknown'
    const quarantined = isQuarantined ? (object.data as QuarantinedData) : undefined
    const originalType =
      typeof quarantined?.originalType === 'string' ? quarantined.originalType : 'unknown'
    const originalVersion =
      typeof quarantined?.originalVersion === 'number' ? quarantined.originalVersion : 0

    objects.push({
      id: object.id,
      type: isQuarantined ? originalType : object.type,
      dataVersion: isQuarantined ? originalVersion : object.dataVersion,
      frame: { ...object.frame },
      parentId: object.parentId,
      order: object.order,
      style: styleToJson(object.style),
      locked: object.locked,
      hidden: object.hidden,
      data: isQuarantined ? quarantined?.raw : object.data,
      meta: {
        createdAt: object.meta.createdAt,
        createdBy: object.meta.createdBy,
        createdVia: object.meta.createdVia,
        ...(object.meta.tags === undefined ? {} : { tags: object.meta.tags }),
      },
    })
  }

  return {
    format: SCHEMA_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    savedAt,
    board: {
      id: doc.id,
      meta: { title: doc.meta.title, createdAt: doc.meta.createdAt },
      objects,
      assets: [...doc.assets.values()].map((asset) => ({
        id: asset.id,
        mimeType: asset.mimeType,
        byteSize: asset.byteSize,
        ...(asset.width === undefined ? {} : { width: asset.width }),
        ...(asset.height === undefined ? {} : { height: asset.height }),
        locator: asset.locator,
      })),
    },
  }
}
