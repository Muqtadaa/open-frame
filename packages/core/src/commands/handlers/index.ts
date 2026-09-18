import type { BoardDocument } from '../../domain/document.js'
import type { Patch } from '../../domain/patch.js'
import type { CommandContext, Command } from '../types.js'
import { createObjects } from './create-objects.js'
import { reorderObjects } from './reorder-objects.js'
import { reparentObjects } from './reparent-objects.js'
import { rotateObjects } from './rotate-objects.js'
import { setHidden, setLocked } from './set-flags.js'
import { deleteObjects } from './delete-objects.js'
import { moveObjects } from './move-objects.js'
import { resizeObjects } from './resize-objects.js'
import { updateObjectData } from './update-object-data.js'
import { updateStyle } from './update-style.js'

/**
 * Routes a command to its handler.
 *
 * This switch is EXHAUSTIVE and lives in exactly one file. It switches on
 * `command.kind` — never on `object.type`, which is the registry's job. Adding
 * a command adds a case here; adding an object type touches nothing in this
 * folder at all.
 */
export function handleCommand(
  doc: BoardDocument,
  command: Command,
  ctx: CommandContext,
): readonly Patch[] {
  switch (command.kind) {
    case 'CreateObjects':
      return createObjects(doc, command, ctx)
    case 'DeleteObjects':
      return deleteObjects(doc, command, ctx)
    case 'MoveObjects':
      return moveObjects(doc, command)
    case 'ResizeObjects':
      return resizeObjects(doc, command, ctx)
    case 'UpdateObjectData':
      return updateObjectData(doc, command, ctx)
    case 'UpdateStyle':
      return updateStyle(doc, command, ctx)
    case 'RotateObjects':
      return rotateObjects(doc, command, ctx)
    case 'ReorderObjects':
      return reorderObjects(doc, command)
    case 'SetLocked':
      return setLocked(doc, command)
    case 'SetHidden':
      return setHidden(doc, command)
    case 'ReparentObjects':
      return reparentObjects(doc, command, ctx)
  }
}

export {
  createObjects,
  deleteObjects,
  moveObjects,
  reorderObjects,
  reparentObjects,
  resizeObjects,
  rotateObjects,
  setHidden,
  setLocked,
  updateObjectData,
  updateStyle,
}
