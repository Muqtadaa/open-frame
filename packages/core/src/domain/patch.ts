import type { BoardDocument } from './document.js'
import type { ObjectId } from './ids.js'
import type { AnyOpenFrameObject } from './object.js'

/**
 * OpenFrame's own change format.
 *
 * Every persistent mutation in the system — from the UI, from undo, and later
 * from AI, the API, MCP and remote collaborators — is expressed as a list of
 * these. Three operations, deliberately:
 *
 *   add     create an object that did not exist
 *   remove  delete an object that did exist
 *   set     replace a value at a path inside an object
 *
 * This is NOT a CRDT format and NOT JSON Patch. It is small, closed and
 * JSON-serializable, which means the collaboration adapter can translate it
 * into Yjs transactions without a single CRDT type ever reaching the domain,
 * the command layer or the UI.
 *
 * A `set` with `value: undefined` DELETES the key. That is how optional style
 * properties are cleared, and it is what makes `invertPatches` exact for
 * properties that did not previously exist.
 */
export type Patch =
  | { readonly op: 'add'; readonly id: ObjectId; readonly object: AnyOpenFrameObject }
  | { readonly op: 'remove'; readonly id: ObjectId }
  | {
      readonly op: 'set'
      readonly id: ObjectId
      readonly path: readonly (string | number)[]
      readonly value: unknown
    }

export class PatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PatchError'
  }
}

function getIn(target: unknown, path: readonly (string | number)[]): unknown {
  let current = target
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[String(key)]
  }
  return current
}

/**
 * Returns a structurally-shared copy of `target` with `path` set to `value`.
 * Only the objects along the path are copied; every untouched branch keeps its
 * identity, which is what lets the renderer compare object references to decide
 * what needs redrawing.
 */
function setIn<T>(target: T, path: readonly (string | number)[], value: unknown): T {
  if (path.length === 0) throw new PatchError('Patch path must not be empty')

  const [head, ...rest] = path
  if (head === undefined) throw new PatchError('Patch path must not be empty')
  const key = String(head)

  if (typeof target !== 'object' || target === null) {
    throw new PatchError(`Cannot set "${key}" on a non-object`)
  }

  if (Array.isArray(target)) {
    const index = Number(head)
    if (!Number.isInteger(index) || index < 0) {
      throw new PatchError(`Array patch path segment must be a non-negative integer, got "${key}"`)
    }
    const copy = [...target] as unknown[]
    copy[index] = rest.length === 0 ? value : setIn(copy[index], rest, value)
    return copy as T
  }

  const copy: Record<string, unknown> = { ...(target as Record<string, unknown>) }
  if (rest.length === 0) {
    if (value === undefined) delete copy[key]
    else copy[key] = value
  } else {
    copy[key] = setIn(copy[key], rest, value)
  }
  return copy as T
}

function applyInto(objects: Map<ObjectId, AnyOpenFrameObject>, patch: Patch): void {
  switch (patch.op) {
    case 'add':
      objects.set(patch.id, patch.object)
      return
    case 'remove':
      if (!objects.has(patch.id)) {
        throw new PatchError(`Cannot remove unknown object "${patch.id}"`)
      }
      objects.delete(patch.id)
      return
    case 'set': {
      const existing = objects.get(patch.id)
      if (existing === undefined) {
        throw new PatchError(`Cannot set on unknown object "${patch.id}"`)
      }
      objects.set(patch.id, setIn(existing, patch.path, patch.value))
      return
    }
  }
}

/** Applies patches in order, returning a new document. Never mutates the input. */
export function applyPatches(doc: BoardDocument, patches: readonly Patch[]): BoardDocument {
  if (patches.length === 0) return doc
  const objects = new Map(doc.objects)
  for (const patch of patches) applyInto(objects, patch)
  return { ...doc, objects }
}

/**
 * Computes the patches that undo `patches` when applied to the document they
 * were generated against.
 *
 * Each inverse is derived from the document state immediately BEFORE its patch
 * ran, and the result is reversed, so applying it undoes the batch in the right
 * order. Every command in the system gets its undo behaviour from this one
 * function — which is why `patch.test.ts` property-tests the round trip rather
 * than testing each command's undo separately.
 */
export function invertPatches(before: BoardDocument, patches: readonly Patch[]): Patch[] {
  const inverse: Patch[] = []
  const objects = new Map(before.objects)

  for (const patch of patches) {
    switch (patch.op) {
      case 'add': {
        const existing = objects.get(patch.id)
        inverse.push(
          existing === undefined
            ? { op: 'remove', id: patch.id }
            : { op: 'add', id: patch.id, object: existing },
        )
        break
      }
      case 'remove': {
        const existing = objects.get(patch.id)
        if (existing === undefined) {
          throw new PatchError(`Cannot invert removal of unknown object "${patch.id}"`)
        }
        inverse.push({ op: 'add', id: patch.id, object: existing })
        break
      }
      case 'set': {
        const existing = objects.get(patch.id)
        if (existing === undefined) {
          throw new PatchError(`Cannot invert set on unknown object "${patch.id}"`)
        }
        inverse.push({
          op: 'set',
          id: patch.id,
          path: patch.path,
          value: getIn(existing, patch.path),
        })
        break
      }
    }
    applyInto(objects, patch)
  }

  return inverse.reverse()
}

/** The ids a patch list touches, for targeted re-render and index updates. */
export function affectedIds(patches: readonly Patch[]): ObjectId[] {
  const ids = new Set<ObjectId>()
  for (const patch of patches) ids.add(patch.id)
  return [...ids]
}

/** True when the patch list changes which objects exist, rather than only their contents. */
export function isStructural(patches: readonly Patch[]): boolean {
  return patches.some((patch) => patch.op !== 'set')
}
