import type { BoardDocument } from '../../domain/document.js'
import type { ObjectId } from '../../domain/ids.js'
import type { Patch } from '../../domain/patch.js'
import { detachConnectors } from '../../types/connector/detach.js'
import { CommandError } from '../errors.js'
import type { Command } from '../types.js'
import { collectWithDescendants, requireObject, requireUnlocked } from './shared.js'

type DeleteObjects = Extract<Command, { kind: 'DeleteObjects' }>

export function deleteObjects(doc: BoardDocument, command: DeleteObjects): Patch[] {
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
  const { patches: detachPatches, alsoDelete } = detachConnectors(doc, doomed)
  for (const id of alsoDelete) doomed.add(id)

  const removals: Patch[] = [...doomed].map((id: ObjectId) => ({ op: 'remove', id }))
  // Detach first: a patch against an object that has already been removed throws.
  return [...detachPatches.filter((patch) => !doomed.has(patch.id)), ...removals]
}
