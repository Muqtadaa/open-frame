import type { BoardDocument } from '../../domain/document.js'
import type { ObjectId } from '../../domain/ids.js'
import type { Patch } from '../../domain/patch.js'
import { detachConnectors } from '../../types/connector/detach.js'
import { CommandError } from '../errors.js'
import type { Command, CommandContext } from '../types.js'
import { collectWithDescendants, requireObject, requireUnlocked } from './shared.js'

type DeleteObjects = Extract<Command, { kind: 'DeleteObjects' }>

export function deleteObjects(
  doc: BoardDocument,
  command: DeleteObjects,
  ctx: CommandContext,
): Patch[] {
  if (command.ids.length === 0) {
    throw new CommandError('invalid-input', 'DeleteObjects requires at least one id')
  }

  for (const id of command.ids) requireUnlocked(requireObject(doc, id))

  // Deleting a container deletes what it holds. Leaving children behind would
  // strand them with a dangling parent, which the load-time repair would then
  // silently reparent to the root — a confusing way to lose structure.
  const doomed = collectWithDescendants(doc, command.ids)

  /*
   * Connectors attached to anything being deleted are handled before the
   * removal patches, so their endpoints can still be resolved. One orphaned end
   * becomes a free point; two orphaned ends delete the connector.
   */
  const { patches: detachPatches, alsoDelete } = detachConnectors(doc, doomed, (other) =>
    ctx.registry.boundsOf(other, doc),
  )
  for (const id of alsoDelete) doomed.add(id)

  /*
   * Relations die with either end (ADR 0011): a citation of nothing is not a
   * citation. This happens HERE, inside the handler, rather than as a second
   * command — one command means one undo entry, so undo restores an object
   * together with everything that cited it. Two commands would restore the
   * object stripped of its provenance and call that success.
   *
   * Iterated to a fixed point because a relation may itself be an endpoint: a
   * relation about a relation is not modelled today, but the loop costs one
   * pass over an empty set when it is not, and silently leaks dangling objects
   * if it is ever added without one.
   */
  for (;;) {
    const orphaned = ctx.registry
      .relationsOrphanedBy(doc, [...doomed])
      .filter((id) => !doomed.has(id))
    if (orphaned.length === 0) break
    for (const id of orphaned) doomed.add(id)
  }

  const removals: Patch[] = [...doomed].map((id: ObjectId) => ({ op: 'remove', id }))
  // Detach first: a patch against an object that has already been removed throws.
  return [
    ...detachPatches.filter((patch) => patch.op === 'meta' || !doomed.has(patch.id)),
    ...removals,
  ]
}
