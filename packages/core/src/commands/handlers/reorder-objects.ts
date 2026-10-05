import { childrenOf, groupByParent } from '../../domain/document.js'
import type { BoardDocument } from '../../domain/document.js'
import type { ObjectId, OrderKey } from '../../domain/ids.js'
import type { AnyOpenFrameObject } from '../../domain/object.js'
import { compareSiblings, orderBetween, ordersBetween } from '../../domain/order.js'
import type { Patch } from '../../domain/patch.js'
import { CommandError } from '../errors.js'
import type { Command } from '../types.js'
import { requireObject, requireUnlocked } from './shared.js'

type ReorderObjects = Extract<Command, { kind: 'ReorderObjects' }>

/**
 * Changes paint order within a container.
 *
 * Because order is a fractional index, moving an object to the front writes
 * exactly ONE object rather than renumbering every sibling — which is what
 * keeps undo entries small and, later, keeps two users reordering at once from
 * clobbering each other.
 */
export function reorderObjects(doc: BoardDocument, command: ReorderObjects): Patch[] {
  if (command.ids.length === 0) {
    throw new CommandError('invalid-input', 'ReorderObjects requires at least one id')
  }

  const moving = new Set<ObjectId>()
  for (const id of command.ids) {
    requireUnlocked(requireObject(doc, id))
    moving.add(id)
  }

  const byParent = groupByParent(doc)
  const patches: Patch[] = []

  // Group by container: "bring to front" means front of your own parent.
  const byContainer = new Map<ObjectId | null, ObjectId[]>()
  for (const id of moving) {
    const parentId = doc.objects.get(id)?.parentId ?? null
    const group = byContainer.get(parentId)
    if (group === undefined) byContainer.set(parentId, [id])
    else group.push(id)
  }

  for (const [parentId, ids] of byContainer) {
    const siblings = (byParent.get(parentId) ?? []).filter((object) => !moving.has(object.id))
    // In sibling order — by key, then id — so a pair that shares a key keeps
    // its stacking when both move. By key alone the sort could not tell them
    // apart and they took new keys in whatever order the command listed them.
    const ordered = ids
      .map((id) => doc.objects.get(id))
      .filter((object): object is AnyOpenFrameObject => object !== undefined)
      .sort(compareSiblings)

    const first = siblings[0]?.order ?? null
    const last = siblings[siblings.length - 1]?.order ?? null

    let keys: OrderKey[]
    switch (command.placement) {
      case 'front':
        keys = ordersBetween(last, null, ordered.length)
        break
      case 'back':
        keys = ordersBetween(null, first, ordered.length)
        break
      case 'forward':
      case 'backward': {
        // Step past exactly one neighbour, which is what users expect from
        // repeated presses — jumping to an end would make the command useless.
        const anchorIndex = neighbourIndex(siblings, ordered, command.placement)
        let before = anchorIndex <= 0 ? null : (siblings[anchorIndex - 1]?.order ?? null)
        let after = siblings[anchorIndex]?.order ?? null
        // Two neighbours that share a key have no key between them, and
        // asking for one throws. Landing between them is not possible without
        // rewriting one of them, so the move carries on past the pair: over
        // all of it going forward, under all of it going back.
        if (before !== null && before === after) {
          const tied = before
          if (command.placement === 'forward') {
            after = siblings.find((s) => s.order > tied)?.order ?? null
          } else {
            before = siblings.findLast((s) => s.order < tied)?.order ?? null
          }
        }
        keys = ordersBetween(before, after, ordered.length)
        break
      }
    }

    ordered.forEach((object, index) => {
      const key = keys[index]
      if (key === undefined) return
      patches.push({ op: 'set', id: object.id, path: ['order'], value: key })
    })
  }

  return patches
}

function neighbourIndex(
  siblings: readonly AnyOpenFrameObject[],
  moving: readonly AnyOpenFrameObject[],
  direction: 'forward' | 'backward',
): number {
  const highest = moving.at(-1)
  const lowest = moving[0]
  if (highest === undefined || lowest === undefined) return siblings.length

  // Compared as (key, id) pairs, as the siblings are sorted: by key alone a
  // neighbour that shares the moving object's key is neither above it nor
  // below it, and the step skipped it.
  if (direction === 'forward') {
    const above = siblings.findIndex((s) => compareSiblings(s, highest) > 0)
    return above === -1 ? siblings.length : above + 1
  }

  const belowCount = siblings.filter((s) => compareSiblings(s, lowest) < 0).length
  return Math.max(0, belowCount - 1)
}

/** Exported for tests that need a container's current paint order. */
export { childrenOf, orderBetween }
