import type { AnyOpenFrameObject, ObjectId, Patch } from '@openframe/core'
import type * as Y from 'yjs'

/**
 * The inbound half of the translation: a `Y.Map` change event, back into
 * OpenFrame patches.
 *
 * Outbound is the easy direction — patches already say what changed. Inbound
 * has to reconstruct that from a before and an after, and the interesting
 * decision is how coarsely.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Structural equality, enough for the plain JSON an object is made of. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => same(item, b[index]))
  }
  if (!isRecord(a) || !isRecord(b)) return false
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => key in b && same(a[key], b[key]))
}

/**
 * The patches that turn `before` into `after`, one per changed top-level key.
 *
 * The obvious alternative is a single `add`, which overwrites the object
 * wholesale and is three lines shorter. It is also wrong in a way that only
 * shows up at scale: `add` is a STRUCTURAL patch, so `isStructural` reports
 * true, the store wakes every structure subscriber, and culling and layout run
 * for the whole board — because somebody else, somewhere, changed one note's
 * colour. A `set` per key keeps a content change a content change, and only the
 * object's own subscribers hear about it.
 *
 * Top-level is as fine-grained as this goes. Recursing into `data` would buy a
 * narrower patch for the same set of re-renders, since a view reading `data`
 * re-renders either way.
 */
function fieldPatches(id: ObjectId, before: unknown, after: AnyOpenFrameObject): Patch[] {
  // No usable before — treat it as arrival rather than guess at a diff.
  if (!isRecord(before)) return [{ op: 'add', id, object: structuredClone(after) }]

  const patches: Patch[] = []
  const next = after as unknown as Record<string, unknown>

  for (const key of Object.keys(next)) {
    if (same(before[key], next[key])) continue
    patches.push({ op: 'set', id, path: [key], value: structuredClone(next[key]) })
  }
  for (const key of Object.keys(before)) {
    // `undefined` DELETES the key — the same convention core's own `setIn` uses,
    // and the reason `invertPatches` is exact for a property that was never set.
    if (!(key in next)) patches.push({ op: 'set', id, path: [key], value: undefined })
  }
  return patches
}

/**
 * Translates one `Y.Map` event into the patches that reproduce it.
 *
 * Callers must decide whether they want the event at all before calling this:
 * an event carrying `LOCAL_ORIGIN` is this client's own write coming back, and
 * feeding it to the dispatcher is how a single edit becomes a loop.
 */
export function patchesFromEvent(event: Y.YMapEvent<AnyOpenFrameObject>): Patch[] {
  const patches: Patch[] = []

  for (const [key, change] of event.changes.keys) {
    const id = key as ObjectId
    const current = event.target.get(key)

    switch (change.action) {
      case 'add':
        /*
         * Yjs reports an add for a key that is now absent only if a later write
         * in the same transaction removed it, in which case there is nothing to
         * add. Skipping is right; pushing an `add` with `undefined` would put a
         * hole in the document.
         */
        if (current === undefined) break
        patches.push({ op: 'add', id, object: structuredClone(current) })
        break
      case 'delete':
        patches.push({ op: 'remove', id })
        break
      case 'update':
        if (current === undefined) break
        patches.push(...fieldPatches(id, change.oldValue, current))
        break
    }
  }

  return patches
}

/**
 * A change to the document's own fields, as patches.
 *
 * A deleted key reads back as `value: undefined`, which is what core's `meta`
 * op means by "no such field" — the same convention `set` already uses, so an
 * inverse derived from a field that was not there before is exact.
 *
 * That falls out of `get` returning `undefined` for a key that is gone rather
 * than from a branch here, and it is worth saying so: an explicit
 * `action === 'delete'` check was written first and then deleted, because
 * removing it broke no test. A guard that cannot fail is not a guard, and
 * leaving it in would have implied one.
 */
export function metaPatchesFromEvent(event: Y.YMapEvent<unknown>): Patch[] {
  const patches: Patch[] = []
  for (const key of event.changes.keys.keys()) {
    patches.push({ op: 'meta', path: [key], value: structuredClone(event.target.get(key)) })
  }
  return patches
}

/**
 * The ids whose parentage an incoming batch could have disturbed.
 *
 * Only three patches can: a write to `parentId`, an arrival (which brings a
 * `parentId` decided on another machine), and a removal (whose children are now
 * orphans). Everything else — a move, a restyle, a text edit — cannot produce a
 * cycle or a dangling parent, and asking about it would turn every keystroke
 * somebody else types into a structural check.
 */
export function parentageCandidates(patches: readonly Patch[]): ObjectId[] {
  const ids = new Set<ObjectId>()
  for (const patch of patches) {
    // A rename cannot orphan anything or make a cycle: it touches no object.
    if (patch.op === 'meta') continue
    if (patch.op === 'set' && patch.path[0] !== 'parentId') continue
    ids.add(patch.id)
  }
  return [...ids]
}
