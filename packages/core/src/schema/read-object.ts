import { asObjectId, asOrderKey, asUserId } from '../domain/ids.js'
import { ORIGINS, type AnyOpenFrameObject, type Origin } from '../domain/object.js'
import type { ObjectTypeRegistry } from '../domain/registry.js'
import { sanitizeStyle } from '../domain/style-boundary.js'
import type { PersistedObject } from './envelope.js'

/** One stored object read back, or why it could not be. */
export type ObjectReading =
  | { readonly ok: true; readonly object: AnyOpenFrameObject }
  | {
      readonly ok: false
      readonly reason: 'unknown-type' | 'migration-failed' | 'invalid-data'
      readonly detail: string
    }

export function toOrigin(value: string): Origin {
  return (ORIGINS as readonly string[]).includes(value) ? (value as Origin) : 'import'
}

/**
 * One stored object brought up to this build: its type's migrations run from
 * the version it was written at, then its type's schema checks the result.
 *
 * Shared by everything that reads objects it did not write — a board loaded
 * from storage, a paste from another tab — so that a paste is held to exactly
 * what a load is, and an older build's objects are upgraded on the way in
 * rather than refused. A NEWER object's migration throws, and is reported as
 * such: this build cannot know what the fields it has never seen mean.
 */
export function readPersistedObject(
  persisted: PersistedObject,
  registry: ObjectTypeRegistry,
): ObjectReading {
  const definition = registry.get(persisted.type)
  if (definition === undefined) {
    return {
      ok: false,
      reason: 'unknown-type',
      detail: `This build has no definition for object type "${persisted.type}".`,
    }
  }

  let data: unknown
  try {
    data = definition.migrate(persisted.data, persisted.dataVersion, persisted.style)
  } catch (error) {
    return {
      ok: false,
      reason: 'migration-failed',
      detail: error instanceof Error ? error.message : String(error),
    }
  }

  const validated = definition.validate(data)
  if (!validated.ok) {
    return { ok: false, reason: 'invalid-data', detail: validated.issues.join('; ') }
  }

  return {
    ok: true,
    object: {
      id: asObjectId(persisted.id),
      type: persisted.type,
      dataVersion: definition.currentVersion,
      frame: { ...persisted.frame },
      parentId: persisted.parentId === null ? null : asObjectId(persisted.parentId),
      order: asOrderKey(persisted.order),
      style: sanitizeStyle(persisted.style),
      locked: persisted.locked,
      hidden: persisted.hidden,
      data: validated.data,
      meta: {
        createdAt: persisted.meta.createdAt,
        createdBy: persisted.meta.createdBy === null ? null : asUserId(persisted.meta.createdBy),
        createdVia: toOrigin(persisted.meta.createdVia),
        ...(persisted.meta.tags === undefined ? {} : { tags: persisted.meta.tags }),
      },
    },
  }
}
