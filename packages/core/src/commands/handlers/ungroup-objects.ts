import { groupByParent } from '../../domain/document.js'
import type { BoardDocument } from '../../domain/document.js'
import type { Patch } from '../../domain/patch.js'
import { CommandError } from '../errors.js'
import type { Command, CommandContext } from '../types.js'
import { deleteObjects } from './delete-objects.js'
import { reparentObjects } from './reparent-objects.js'
import { requireObject, requireUnlocked, sequence } from './shared.js'

type UngroupObjects = Extract<Command, { kind: 'UngroupObjects' }>

/**
 * Dissolves groups, keeping what they held.
 *
 * What counts as a group is the capability, not the name (rule 18): a type
 * whose members are selected through it.
 */
export function ungroupObjects(
  doc: BoardDocument,
  command: UngroupObjects,
  ctx: CommandContext,
): Patch[] {
  const groups = command.ids
    .map((id) => requireObject(doc, id))
    .filter((object) => ctx.registry.get(object.type)?.capabilities.selectsAsUnit === true)
  if (groups.length === 0) {
    throw new CommandError('invalid-input', 'There is no group here to ungroup')
  }
  for (const group of groups) requireUnlocked(group)

  // One index for every group, rather than a scan of the board per group.
  const children = groupByParent(doc)
  /*
   * Members are lifted out BEFORE the group is deleted. The other order would
   * cascade the delete into its own contents — deleting a container takes its
   * children with it.
   */
  const lifts = groups.flatMap((group) => {
    const members = children.get(group.id) ?? []
    if (members.length === 0) return []
    return [
      (view: BoardDocument) =>
        reparentObjects(
          view,
          {
            kind: 'ReparentObjects',
            ids: members.map((object) => object.id),
            parentId: group.parentId ?? null,
          },
          ctx,
        ),
    ]
  })
  return sequence(doc, [
    ...lifts,
    (view) =>
      deleteObjects(view, { kind: 'DeleteObjects', ids: groups.map((group) => group.id) }, ctx),
  ])
}
