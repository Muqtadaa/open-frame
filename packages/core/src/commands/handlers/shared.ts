import type { BoardDocument } from '../../domain/document.js'
import type { ObjectId } from '../../domain/ids.js'
import type { AnyOpenFrameObject } from '../../domain/object.js'
import { setIn, type Patch } from '../../domain/patch.js'
import { unpaintableColours } from '../../domain/style-boundary.js'
import { CommandError } from '../errors.js'

/** Fetches an object or rejects the whole command. */
export function requireObject(doc: BoardDocument, id: ObjectId): AnyOpenFrameObject {
  const object = doc.objects.get(id)
  if (object === undefined) {
    throw new CommandError('unknown-object', `Object "${id}" does not exist on this board`)
  }
  return object
}

/**
 * Locking is enforced HERE, at the command layer — not in the UI.
 * A disabled button is a courtesy; this is the rule.
 */
export function requireUnlocked(object: AnyOpenFrameObject): AnyOpenFrameObject {
  if (object.locked) {
    throw new CommandError('object-locked', `Object "${object.id}" is locked`)
  }
  return object
}

export function requireFinite(value: number, what: string): number {
  if (!Number.isFinite(value)) {
    throw new CommandError('invalid-input', `${what} must be a finite number`)
  }
  return value
}

/** An object and everything beneath it, so deletes never orphan children. */
export function collectWithDescendants(
  doc: BoardDocument,
  ids: readonly ObjectId[],
): Set<ObjectId> {
  const childrenByParent = new Map<ObjectId, ObjectId[]>()
  for (const object of doc.objects.values()) {
    if (object.parentId === null) continue
    const siblings = childrenByParent.get(object.parentId)
    if (siblings === undefined) childrenByParent.set(object.parentId, [object.id])
    else siblings.push(object.id)
  }

  const collected = new Set<ObjectId>()
  const stack = [...ids]
  while (stack.length > 0) {
    const id = stack.pop()
    if (id === undefined || collected.has(id)) continue
    collected.add(id)
    for (const child of childrenByParent.get(id) ?? []) stack.push(child)
  }
  return collected
}

/**
 * A style whose colours a view can paint, or the whole command is rejected.
 * A colour is handed to CSS as written, so `url(https://…)` would be fetched
 * by every viewer's browser (tracks A-3).
 */
export function requirePaintable(style: object): void {
  const bad = unpaintableColours(style)
  if (bad.length > 0) {
    throw new CommandError(
      'invalid-input',
      `style.${bad.join(', style.')} must be a palette colour, #rrggbb or none`,
    )
  }
}

/**
 * Runs handlers one after another, each seeing what the ones before it did,
 * and returns every patch in order — for the commands that are several
 * others to the document but one thing to a person (group is a create and a
 * reparent into what was created).
 *
 * Later steps read an OVERLAY of the changed objects over the board, never a
 * copy of it. A copy is the O(n) per command that rule 10 records costing an
 * agent's transaction 406ms; the overlay costs what the steps touched.
 */
export function sequence(
  doc: BoardDocument,
  steps: readonly ((doc: BoardDocument) => readonly Patch[])[],
): Patch[] {
  const changed = new Map<ObjectId, AnyOpenFrameObject | null>()
  const view: BoardDocument = { ...doc, objects: new Overlay(doc.objects, changed) }
  const patches: Patch[] = []
  for (const step of steps) {
    const produced = step(view)
    for (const patch of produced) {
      if (patch.op === 'meta') continue
      if (patch.op === 'add') changed.set(patch.id, patch.object)
      else if (patch.op === 'remove') changed.set(patch.id, null)
      else {
        const current = view.objects.get(patch.id)
        if (current !== undefined) changed.set(patch.id, setIn(current, patch.path, patch.value))
      }
    }
    patches.push(...produced)
  }
  return patches
}

/** The board's objects with a few replaced, added or (as `null`) removed. */
class Overlay implements ReadonlyMap<ObjectId, AnyOpenFrameObject> {
  readonly #base: ReadonlyMap<ObjectId, AnyOpenFrameObject>
  readonly #changed: ReadonlyMap<ObjectId, AnyOpenFrameObject | null>

  constructor(
    base: ReadonlyMap<ObjectId, AnyOpenFrameObject>,
    changed: ReadonlyMap<ObjectId, AnyOpenFrameObject | null>,
  ) {
    this.#base = base
    this.#changed = changed
  }

  get(id: ObjectId): AnyOpenFrameObject | undefined {
    const changed = this.#changed.get(id)
    if (changed !== undefined) return changed ?? undefined
    return this.#base.get(id)
  }

  has(id: ObjectId): boolean {
    return this.get(id) !== undefined
  }

  get size(): number {
    let size = this.#base.size
    for (const [id, object] of this.#changed) {
      const existed = this.#base.has(id)
      if (object === null && existed) size -= 1
      else if (object !== null && !existed) size += 1
    }
    return size
  }

  *entries(): MapIterator<[ObjectId, AnyOpenFrameObject]> {
    for (const [id, object] of this.#base) {
      const changed = this.#changed.get(id)
      if (changed === undefined) yield [id, object]
      else if (changed !== null) yield [id, changed]
    }
    for (const [id, object] of this.#changed) {
      if (object !== null && !this.#base.has(id)) yield [id, object]
    }
  }

  *keys(): MapIterator<ObjectId> {
    for (const [id] of this.entries()) yield id
  }

  *values(): MapIterator<AnyOpenFrameObject> {
    for (const [, object] of this.entries()) yield object
  }

  [Symbol.iterator](): MapIterator<[ObjectId, AnyOpenFrameObject]> {
    return this.entries()
  }

  forEach(
    callback: (
      value: AnyOpenFrameObject,
      key: ObjectId,
      map: ReadonlyMap<ObjectId, AnyOpenFrameObject>,
    ) => void,
  ): void {
    for (const [id, object] of this.entries()) callback(object, id, this)
  }
}
