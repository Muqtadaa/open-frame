import type { AnyOpenFrameObject, BoardDocument, ObjectId, Patch } from '@openframe/core'
/*
 * Types only — this module reaches for `doc.getMap` and `doc.transact`, never
 * for a Yjs constructor. It is worth noticing: the translation itself has no
 * runtime dependency on the CRDT at all, which is what makes ADR 0013's
 * fallback to Hocuspocus a change of transport rather than a rewrite.
 *
 * `dependency-cruiser` still counts this as an import, so the quarantine rule
 * holds regardless.
 */
import type * as Y from 'yjs'

/**
 * How a board sits inside a `Y.Doc`.
 *
 * One `Y.Map` at the root, keyed by `ObjectId`, each value a plain JSON object.
 * That is the flat object map [ADR 0003](../../../docs/adr/0003-canonical-document-model.md)
 * chose and [ADR 0007](../../../docs/adr/0007-collaboration-yjs-deferred.md)
 * kept — "CRDTs merge trees badly" — so the shape the document already has IS
 * the shape the CRDT wants. No translation of structure, only of operations.
 *
 * Objects are stored as plain values rather than nested `Y.Map`s. The reason is
 * the one the whole project keeps running into: a `Patch` `set` addresses a
 * PATH inside one object, and the two edits that realistically race are to
 * different objects, not to different keys of the same one — because nothing is
 * written during a drag, so a gesture produces exactly one write per object it
 * touched. Nested maps would buy per-key merging for a collision that the
 * command layer has already made rare, at the cost of a second representation
 * of every object to keep in step.
 */
export const OBJECTS = 'objects'

export function objectsOf(doc: Y.Doc): Y.Map<AnyOpenFrameObject> {
  return doc.getMap<AnyOpenFrameObject>(OBJECTS)
}

/**
 * The origin stamped on every transaction this adapter makes.
 *
 * `origin` already exists on every command envelope and `skipUndo` already
 * exists on dispatch — both were built in Phase 1 for exactly this
 * (ADR 0007). A change arriving from the network is tagged so the local undo
 * stack can ignore it: undo must revert YOUR change, not the most recent one.
 */
export const REMOTE_ORIGIN = 'openframe:remote'

/** Deep-frozen structural copy, so a document never shares a reference with the CRDT. */
function plain<T>(value: T): T {
  return structuredClone(value)
}

/**
 * Applies OpenFrame patches to a `Y.Doc`, in ONE transaction.
 *
 * One transaction per patch batch, not per patch, because a batch is one user
 * action — a drag that moved three objects, a promotion that changed a type and
 * its data. Splitting it would let a collaborator observe half of an action,
 * and would put the halves into undo separately.
 */
export function applyPatchesToDoc(doc: Y.Doc, patches: readonly Patch[], origin?: unknown): void {
  if (patches.length === 0) return
  doc.transact(() => {
    const objects = objectsOf(doc)
    for (const patch of patches) {
      switch (patch.op) {
        case 'add':
          objects.set(patch.id, plain(patch.object))
          break
        case 'remove':
          objects.delete(patch.id)
          break
        case 'set': {
          const current = objects.get(patch.id)
          /*
           * A `set` against an object that is not here is DROPPED, not an
           * error.
           *
           * Locally that cannot happen — the command layer validated against a
           * document that contained it. Across a network it can: someone
           * deleted the object while this edit was in flight. Their delete wins
           * and this write has nothing to apply to, which is a merge outcome
           * rather than a fault. Throwing would take down the sync loop over a
           * race the model is designed to have.
           */
          if (current === undefined) break
          objects.set(patch.id, setIn(current, patch.path, patch.value))
          break
        }
      }
    }
  }, origin)
}

/**
 * A structurally-shared copy with `path` set — the same semantics as core's
 * own `setIn`, including that `undefined` DELETES the key.
 *
 * Reimplemented here rather than imported because core does not export it, and
 * because this one operates on a value that came out of a CRDT: it must never
 * mutate what it was handed, since Yjs hands back live references.
 */
function setIn<T>(target: T, path: readonly (string | number)[], value: unknown): T {
  const [head, ...rest] = path
  if (head === undefined) return value as T
  const key = String(head)

  const source = target as unknown as Record<string, unknown>
  /*
   * An array is copied as an array. Spreading one into an object would turn
   * `tags: ['a']` into `tags: { 0: 'a' }` on the first write to it — valid
   * JSON, accepted by nothing, and invisible until somebody's tags stopped
   * rendering.
   */
  const copy = (Array.isArray(target) ? [...(target as unknown[])] : { ...source }) as Record<
    string,
    unknown
  >

  if (rest.length === 0) {
    // `undefined` deletes, which is what makes `invertPatches` exact for a
    // property that did not previously exist.
    if (value === undefined) delete copy[key]
    else copy[key] = plain(value)
  } else {
    copy[key] = setIn(source[key] ?? {}, rest, value)
  }
  return copy as T
}

/** Every object in the `Y.Doc`, as the plain map a `BoardDocument` holds. */
export function objectsFromDoc(doc: Y.Doc): Map<ObjectId, AnyOpenFrameObject> {
  const objects = new Map<ObjectId, AnyOpenFrameObject>()
  for (const [id, object] of objectsOf(doc).entries()) {
    objects.set(id as ObjectId, plain(object))
  }
  return objects
}

/** Seeds an empty `Y.Doc` from a document already in memory. */
export function seedDoc(doc: Y.Doc, board: BoardDocument, origin?: unknown): void {
  doc.transact(() => {
    const objects = objectsOf(doc)
    for (const [id, object] of board.objects) objects.set(id, plain(object))
  }, origin)
}
