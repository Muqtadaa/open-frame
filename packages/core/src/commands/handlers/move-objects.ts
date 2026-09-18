import type { BoardDocument } from '../../domain/document.js'
import type { ObjectId } from '../../domain/ids.js'
import type { Patch } from '../../domain/patch.js'
import { CommandError } from '../errors.js'
import type { Command } from '../types.js'
import { requireFinite, requireObject, requireUnlocked } from './shared.js'

type MoveObjects = Extract<Command, { kind: 'MoveObjects' }>

/**
 * Moves objects by a delta, cascading into their contents.
 *
 * COORDINATES ARE ABSOLUTE. Every object stores board coordinates, including
 * objects inside a frame, so moving a container must explicitly move what it
 * holds — this handler expands each move to the object's descendants.
 *
 * The alternative, storing child positions relative to their parent, would make
 * a container move one patch instead of N. It was rejected because every
 * geometry consumer — rendering, hit testing, culling, marquee selection,
 * selection bounds — works in world space, and relative coordinates would mean
 * resolving a parent chain in all of them, with nested containers compounding
 * the cost. Absolute coordinates keep the expensive paths trivial and pay for it
 * in patch volume on a single gesture, which is still ONE undo entry, one save
 * and one network message.
 *
 * This runs ONCE per drag, on pointer-up — never per pointer-move.
 */
export function moveObjects(doc: BoardDocument, command: MoveObjects): Patch[] {
  if (command.moves.length === 0) {
    throw new CommandError('invalid-input', 'MoveObjects requires at least one move')
  }

  // Explicit moves win over an inherited one, so selecting both a frame and one
  // of its children does not apply the delta to that child twice.
  const deltas = new Map<ObjectId, { dx: number; dy: number }>()

  for (const move of command.moves) {
    requireUnlocked(requireObject(doc, move.id))
    requireFinite(move.dx, 'Move dx')
    requireFinite(move.dy, 'Move dy')
    deltas.set(move.id, { dx: move.dx, dy: move.dy })
  }

  const childrenByParent = new Map<ObjectId, ObjectId[]>()
  for (const object of doc.objects.values()) {
    if (object.parentId === null) continue
    const siblings = childrenByParent.get(object.parentId)
    if (siblings === undefined) childrenByParent.set(object.parentId, [object.id])
    else siblings.push(object.id)
  }

  for (const move of command.moves) {
    const stack = [...(childrenByParent.get(move.id) ?? [])]
    while (stack.length > 0) {
      const id = stack.pop()
      if (id === undefined || deltas.has(id)) continue
      deltas.set(id, { dx: move.dx, dy: move.dy })
      stack.push(...(childrenByParent.get(id) ?? []))
    }
  }

  const patches: Patch[] = []
  for (const [id, delta] of deltas) {
    if (delta.dx === 0 && delta.dy === 0) continue
    const object = doc.objects.get(id)
    if (object === undefined) continue
    // A locked child does not block moving its container: the lock protects the
    // object from being edited directly, not from travelling with its frame.
    patches.push({
      op: 'set',
      id,
      path: ['frame'],
      value: { ...object.frame, x: object.frame.x + delta.dx, y: object.frame.y + delta.dy },
    })
  }
  return patches
}
