import type { BoardDocument } from '../../domain/document.js'
import type { ObjectId } from '../../domain/ids.js'
import type { AnyOpenFrameObject } from '../../domain/object.js'
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
