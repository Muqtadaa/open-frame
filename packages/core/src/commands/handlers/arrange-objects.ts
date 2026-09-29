import type { BoardDocument } from '../../domain/document.js'
import type { ObjectId } from '../../domain/ids.js'
import type { Patch } from '../../domain/patch.js'
import type { Rect } from '../../geometry/rect.js'
import { alignOffsets, distributeOffsets } from '../../geometry/arrange.js'
import type { Command, CommandContext } from '../types.js'
import { moveObjects } from './move-objects.js'
import { requireObject } from './shared.js'

type AlignObjects = Extract<Command, { kind: 'AlignObjects' }>
type DistributeObjects = Extract<Command, { kind: 'DistributeObjects' }>

type Offsets = (items: readonly { id: ObjectId; bounds: Rect }[]) => readonly {
  readonly id: ObjectId
  readonly dx: number
  readonly dy: number
}[]

export function alignObjects(
  doc: BoardDocument,
  command: AlignObjects,
  ctx: CommandContext,
): Patch[] {
  return arrange(doc, command.ids, ctx, (items) => alignOffsets(items, command.edge))
}

export function distributeObjects(
  doc: BoardDocument,
  command: DistributeObjects,
  ctx: CommandContext,
): Patch[] {
  return arrange(doc, command.ids, ctx, (items) => distributeOffsets(items, command.axis))
}

/**
 * Applies an arrangement as ONE move. `MoveObjects` already cascades into a
 * container's contents, which aligning a group needs.
 *
 * Two kinds of object are held out of the moving:
 *
 * A type whose shape IS its ends, which is asked of the registry rather than
 * compared against 'connector'. A connector has no position of its own; it is
 * wherever the things it joins are, so moving it would be a patch that changes
 * nothing (rule 16), and counting it as a thing to line up would be lining up a
 * consequence.
 *
 * A locked object, which the move would refuse outright — but it still counts
 * toward the bounding box everything lines up on, since it is visibly part of
 * what was selected and aligning TO something pinned down is a reasonable
 * thing to want.
 */
function arrange(
  doc: BoardDocument,
  ids: readonly ObjectId[],
  ctx: CommandContext,
  offsetsOf: Offsets,
): Patch[] {
  const selected = ids
    .map((id) => requireObject(doc, id))
    .filter((object) => ctx.registry.get(object.type)?.capabilities.spatial === true)
    .filter((object) => ctx.registry.endpointsOf(object, doc).length === 0)

  const items = selected.map((object) => ({
    id: object.id,
    // From the REGISTRY: a rotated object's extent is not its frame, and lining
    // up frames would leave a rotated note visibly off the line.
    bounds: ctx.registry.boundsOf(object, doc),
  }))

  const movable = new Set(selected.filter((object) => !object.locked).map((object) => object.id))
  const moves = offsetsOf(items)
    .filter((offset) => movable.has(offset.id))
    .filter((offset) => offset.dx !== 0 || offset.dy !== 0)
  // Everything already where it belongs: nothing to do, and nothing that should
  // cost an undo step.
  if (moves.length === 0) return []
  return moveObjects(doc, { kind: 'MoveObjects', moves })
}
