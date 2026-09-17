import type { BoardDocument } from '../../domain/document.js'
import type { Patch } from '../../domain/patch.js'
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

  return [...doomed].map((id) => ({ op: 'remove', id }))
}
