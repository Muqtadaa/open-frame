import type { BoardDocument } from '../../domain/document.js'
import type { Patch } from '../../domain/patch.js'
import { CommandError } from '../errors.js'
import type { Command, CommandContext } from '../types.js'
import { createObjects } from './create-objects.js'
import { reparentObjects } from './reparent-objects.js'
import { requireObject, sequence } from './shared.js'

type GroupObjects = Extract<Command, { kind: 'GroupObjects' }>

/**
 * A new group, and the objects moved into it — one step to undo.
 *
 * The group is created INSIDE the members' parent, so grouping notes in a
 * frame leaves them in that frame. It has no frame of its own worth the name;
 * its extent is its members' (rule 16).
 */
export function groupObjects(
  doc: BoardDocument,
  command: GroupObjects,
  ctx: CommandContext,
): Patch[] {
  const members = command.ids.map((id) => requireObject(doc, id))
  // One object is already a unit, and nothing cannot be grouped.
  if (members.length < 2) {
    throw new CommandError('invalid-input', 'GroupObjects needs at least two objects')
  }
  // Mixed parents would mean lifting objects out of their frames as a side
  // effect of grouping, which is not what was asked for.
  const parentId = members[0]?.parentId ?? null
  if (members.some((object) => (object.parentId ?? null) !== parentId)) {
    throw new CommandError('invalid-input', 'Only objects in the same place can be grouped')
  }

  const id = command.id ?? ctx.ids.objectId()
  return sequence(doc, [
    (view) =>
      createObjects(
        view,
        { kind: 'CreateObjects', objects: [{ type: 'group', id, x: 0, y: 0, parentId }] },
        ctx,
      ),
    (view) =>
      reparentObjects(view, { kind: 'ReparentObjects', ids: command.ids, parentId: id }, ctx),
  ])
}
