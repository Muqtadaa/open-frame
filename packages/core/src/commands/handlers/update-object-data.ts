import type { BoardDocument } from '../../domain/document.js'
import type { Patch } from '../../domain/patch.js'
import { CommandError } from '../errors.js'
import type { CommandContext, Command } from '../types.js'
import { requireObject, requireUnlocked } from './shared.js'

type UpdateObjectData = Extract<Command, { kind: 'UpdateObjectData' }>

/**
 * Edits an object's semantic payload.
 *
 * The merged result is validated against the type's own schema BEFORE any patch
 * is produced, so an invalid edit can never reach the document. This is one of
 * the few places the domain validates internally rather than at a boundary, and
 * it earns it: `patch` is an arbitrary record that may have come from an AI
 * response, an API request or an importer.
 *
 * Text editing does NOT dispatch per keystroke. The in-progress buffer is
 * interaction state; one command is issued when editing ends. Intra-field undo
 * belongs to the native input element, not to the board's history.
 */
export function updateObjectData(
  doc: BoardDocument,
  command: UpdateObjectData,
  ctx: CommandContext,
): Patch[] {
  const object = requireUnlocked(requireObject(doc, command.id))

  const definition = ctx.registry.get(object.type)
  if (definition === undefined) {
    throw new CommandError(
      'unknown-type',
      `Cannot edit an object of unregistered type "${object.type}"`,
    )
  }

  const keys = Object.keys(command.patch)
  if (keys.length === 0) {
    throw new CommandError('invalid-input', 'UpdateObjectData requires at least one field')
  }

  const current = (object.data ?? {}) as Record<string, unknown>
  const merged: Record<string, unknown> = { ...current, ...command.patch }

  const validated = definition.validate(merged)
  if (!validated.ok) {
    throw new CommandError('invalid-data', validated.issues.join('; '))
  }

  return [{ op: 'set', id: command.id, path: ['data'], value: validated.data }]
}
