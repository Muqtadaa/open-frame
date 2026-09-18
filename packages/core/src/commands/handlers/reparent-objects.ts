import { childrenOf } from '../../domain/document.js'
import type { BoardDocument } from '../../domain/document.js'
import { wouldCreateCycle } from '../../domain/invariants.js'
import { ordersBetween } from '../../domain/order.js'
import type { Patch } from '../../domain/patch.js'
import { CommandError } from '../errors.js'
import type { Command, CommandContext } from '../types.js'
import { collectWithDescendants, requireObject, requireUnlocked } from './shared.js'

type ReparentObjects = Extract<Command, { kind: 'ReparentObjects' }>

/**
 * Moves objects into or out of a container.
 *
 * Coordinates are ABSOLUTE, so reparenting changes membership only — nothing
 * needs repositioning. See `move-objects.ts` for why that model was chosen.
 */
export function reparentObjects(
  doc: BoardDocument,
  command: ReparentObjects,
  ctx: CommandContext,
): Patch[] {
  if (command.ids.length === 0) {
    throw new CommandError('invalid-input', 'ReparentObjects requires at least one id')
  }

  const parentId = command.parentId
  if (parentId !== null) {
    const parent = requireObject(doc, parentId)
    const capabilities = ctx.registry.get(parent.type)?.capabilities
    if (capabilities !== undefined && !capabilities.canHaveChildren) {
      throw new CommandError(
        'invalid-input',
        `Object type "${parent.type}" cannot contain other objects`,
      )
    }
  }

  const moving = command.ids.filter((id) => doc.objects.get(id)?.parentId !== parentId)
  for (const id of moving) requireUnlocked(requireObject(doc, id))

  /*
   * The cycle guard, finally with a caller. Dropping a frame into its own
   * descendant would make both unreachable, and under concurrent editing this
   * is the one corruption last-writer-wins cannot prevent.
   */
  for (const id of moving) {
    if (wouldCreateCycle(doc.objects, id, parentId)) {
      throw new CommandError(
        'would-create-cycle',
        'Cannot put an object inside itself or its own contents',
      )
    }
  }

  if (moving.length === 0) return []

  // Appended after the target's existing children, so a dropped object lands on
  // top of what is already there rather than behind it.
  const existing = childrenOf(doc, parentId).filter((object) => !moving.includes(object.id))
  const lastOrder = existing[existing.length - 1]?.order ?? null
  const orders = ordersBetween(lastOrder, null, moving.length)

  const patches: Patch[] = []
  moving.forEach((id, index) => {
    patches.push({ op: 'set', id, path: ['parentId'], value: parentId })
    const order = orders[index]
    if (order !== undefined) patches.push({ op: 'set', id, path: ['order'], value: order })
  })
  return patches
}

export { collectWithDescendants }
