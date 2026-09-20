import { PersistedObjectSchema } from '../../schema/envelope.js'
import { asObjectId, asOrderKey, asUserId } from '../../domain/ids.js'
import type { AnyOpenFrameObject } from '../../domain/object.js'
import type { ObjectTypeRegistry } from '../../domain/registry.js'
import { sanitizeStyle } from '../../domain/style-boundary.js'

/**
 * An object arriving from another client, checked before it is believed.
 *
 * Rule 8 names the boundaries where validation belongs, and this became one
 * the day accounts shipped: until there was a transport there was no untrusted
 * peer, and a guard written then would have been a guard never run against the
 * thing it defends. There is one now. Anyone holding a board's edit link can
 * put arbitrary JSON into the shared map, and until this existed it went
 * straight into the document — a `frame.width` of `"wide"`, a `parentId` that
 * is a number, an object claiming a type this build has never heard of.
 *
 * REJECTED, NOT REPAIRED, and never thrown.
 *
 * Not repaired, because a half-understood object is worse than an absent one:
 * the load path quarantines rather than guesses for exactly this reason, and
 * there is no user here to tell. Not thrown, because a single bad object from
 * one peer would take down the sync loop for everybody — the merge path has to
 * survive a peer that is broken or hostile, which is the whole point of
 * checking.
 *
 * What is NOT done here is migration. The load path migrates because the
 * document on disk may predate this build; a peer is running some version of
 * this application right now, and an object whose `dataVersion` this build
 * cannot read is one it should not pretend to understand.
 */
export function readRemoteObject(
  raw: unknown,
  registry: ObjectTypeRegistry,
): AnyOpenFrameObject | null {
  const envelope = PersistedObjectSchema.safeParse(raw)
  if (!envelope.success) return null

  const persisted = envelope.data
  const definition = registry.get(persisted.type)
  // An unknown type is refused rather than quarantined. Quarantine exists so a
  // person does not lose their own work to a version skew; a peer's object
  // this build cannot render is not this board's to keep.
  if (definition === undefined) return null
  if (persisted.dataVersion !== definition.currentVersion) return null

  const validated = definition.validate(persisted.data)
  if (!validated.ok) return null

  return {
    id: asObjectId(persisted.id),
    type: persisted.type,
    dataVersion: persisted.dataVersion,
    frame: { ...persisted.frame },
    parentId: persisted.parentId === null ? null : asObjectId(persisted.parentId),
    order: asOrderKey(persisted.order),
    // Same gate the load path uses: a peer is no more trusted than a file.
    style: sanitizeStyle(persisted.style),
    locked: persisted.locked,
    hidden: persisted.hidden,
    data: validated.data,
    meta: {
      createdAt: persisted.meta.createdAt,
      createdBy: persisted.meta.createdBy === null ? null : asUserId(persisted.meta.createdBy),
      createdVia: persisted.meta.createdVia,
      ...(persisted.meta.tags === undefined ? {} : { tags: persisted.meta.tags }),
    },
  } as AnyOpenFrameObject
}
