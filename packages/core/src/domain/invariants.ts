import type { BoardDocument } from './document.js'
import type { ObjectId } from './ids.js'
import type { AnyOpenFrameObject } from './object.js'

/**
 * Structural rules a board must satisfy, and the repairs that restore them.
 *
 * These run when a document is loaded and (later) after remote changes merge.
 * A cycle is the one corruption that concurrent editing can create on its own:
 * two users reparenting A under B and B under A at the same moment both
 * succeed locally and produce an unreachable loop on merge. No last-writer-wins
 * register prevents it, so the merge path has to detect and break it.
 *
 * The bias throughout is REPAIR, not reject. One bad parent pointer must never
 * cost a user access to their board.
 */

export type RepairKind =
  'detached-cycle' | 'dangling-parent' | 'self-parent' | 'id-mismatch' | 'non-finite-frame'

export interface Repair {
  readonly kind: RepairKind
  readonly objectId: ObjectId
  readonly detail: string
}

export interface RepairResult {
  readonly document: BoardDocument
  readonly repairs: readonly Repair[]
}

function hasFiniteFrame(object: AnyOpenFrameObject): boolean {
  const { x, y, width, height, rotation } = object.frame
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    Number.isFinite(rotation)
  )
}

/**
 * Detects a parent cycle reachable from `startId`.
 * Returns the ids on the cycle, or `null` when the chain terminates at the root.
 */
export function findParentCycle(
  objects: ReadonlyMap<ObjectId, AnyOpenFrameObject>,
  startId: ObjectId,
): ObjectId[] | null {
  const path: ObjectId[] = []
  const seen = new Set<ObjectId>()
  let current: ObjectId | null = startId

  while (current !== null) {
    if (seen.has(current)) {
      return path.slice(path.indexOf(current))
    }
    seen.add(current)
    path.push(current)
    current = objects.get(current)?.parentId ?? null
  }
  return null
}

/**
 * True when reparenting `id` under `nextParentId` would create a cycle.
 * The command layer calls this BEFORE applying a reparent, so well-behaved
 * clients never create one in the first place.
 */
export function wouldCreateCycle(
  objects: ReadonlyMap<ObjectId, AnyOpenFrameObject>,
  id: ObjectId,
  nextParentId: ObjectId | null,
): boolean {
  if (nextParentId === null) return false
  if (nextParentId === id) return true

  const seen = new Set<ObjectId>([id])
  let current: ObjectId | null = nextParentId
  while (current !== null) {
    if (seen.has(current)) return true
    seen.add(current)
    current = objects.get(current)?.parentId ?? null
  }
  return false
}

/**
 * Restores every structural invariant, reporting what it had to change.
 *
 * Cycles are broken deterministically — the member with the lowest id is
 * detached to the board root — so two clients repairing the same corrupted
 * document independently reach the same result.
 */
export function repairDocument(doc: BoardDocument): RepairResult {
  const repairs: Repair[] = []
  const objects = new Map(doc.objects)

  for (const [key, object] of objects) {
    if (object.id !== key) {
      repairs.push({
        kind: 'id-mismatch',
        objectId: key,
        detail: `Object stored under "${key}" reports id "${object.id}"; keyed by storage id`,
      })
      objects.set(key, { ...object, id: key })
    }
  }

  for (const [id, object] of objects) {
    if (object.parentId === id) {
      repairs.push({ kind: 'self-parent', objectId: id, detail: 'Object was its own parent' })
      objects.set(id, { ...object, parentId: null })
      continue
    }
    if (object.parentId !== null && !objects.has(object.parentId)) {
      repairs.push({
        kind: 'dangling-parent',
        objectId: id,
        detail: `Parent "${object.parentId}" does not exist`,
      })
      objects.set(id, { ...object, parentId: null })
    }
  }

  for (const id of [...objects.keys()]) {
    const cycle = findParentCycle(objects, id)
    if (cycle === null) continue
    const detach = [...cycle].sort()[0]
    if (detach === undefined) continue
    const object = objects.get(detach)
    if (object === undefined) continue
    repairs.push({
      kind: 'detached-cycle',
      objectId: detach,
      detail: `Broke parent cycle [${cycle.join(' -> ')}] by detaching to root`,
    })
    objects.set(detach, { ...object, parentId: null })
  }

  for (const [id, object] of objects) {
    if (hasFiniteFrame(object)) continue
    repairs.push({
      kind: 'non-finite-frame',
      objectId: id,
      detail: 'Frame contained a non-finite number; reset to the origin',
    })
    objects.set(id, {
      ...object,
      frame: {
        x: Number.isFinite(object.frame.x) ? object.frame.x : 0,
        y: Number.isFinite(object.frame.y) ? object.frame.y : 0,
        width: Number.isFinite(object.frame.width) ? object.frame.width : 100,
        height: Number.isFinite(object.frame.height) ? object.frame.height : 100,
        rotation: Number.isFinite(object.frame.rotation) ? object.frame.rotation : 0,
      },
    })
  }

  return repairs.length === 0
    ? { document: doc, repairs: [] }
    : { document: { ...doc, objects }, repairs }
}
