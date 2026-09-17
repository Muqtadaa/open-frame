import { childrenOf, groupByParent } from '../../domain/document.js'
import type { BoardDocument } from '../../domain/document.js'
import type { ObjectId, OrderKey } from '../../domain/ids.js'
import { compareOrder, orderBetween, ordersBetween } from '../../domain/order.js'
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
    const ordered = [...ids].sort((a, b) => {
      const left = doc.objects.get(a)?.order
      const right = doc.objects.get(b)?.order
      return left === undefined || right === undefined ? 0 : compareOrder(left, right)
    })

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
        const anchorIndex = neighbourIndex(siblings, doc, ordered, command.placement)
        const before = anchorIndex <= 0 ? null : (siblings[anchorIndex - 1]?.order ?? null)
        const after = siblings[anchorIndex]?.order ?? null
        keys = ordersBetween(before, after, ordered.length)
        break
      }
    }

    ordered.forEach((id, index) => {
      const key = keys[index]
      if (key === undefined) return
      patches.push({ op: 'set', id, path: ['order'], value: key })
    })
  }

  return patches
}

function neighbourIndex(
  siblings: readonly { readonly id: ObjectId; readonly order: OrderKey }[],
  doc: BoardDocument,
  moving: readonly ObjectId[],
  direction: 'forward' | 'backward',
): number {
  const orders = moving
    .map((id) => doc.objects.get(id)?.order)
    .filter((order): order is OrderKey => order !== undefined)
  if (orders.length === 0) return siblings.length

  if (direction === 'forward') {
    const highest = orders.reduce((a, b) => (compareOrder(a, b) >= 0 ? a : b))
    const above = siblings.findIndex((s) => compareOrder(s.order, highest) > 0)
    return above === -1 ? siblings.length : above + 1
  }

  const lowest = orders.reduce((a, b) => (compareOrder(a, b) <= 0 ? a : b))
  const belowCount = siblings.filter((s) => compareOrder(s.order, lowest) < 0).length
  return Math.max(0, belowCount - 1)
}

/** Exported for tests that need a container's current paint order. */
export { childrenOf, orderBetween }
