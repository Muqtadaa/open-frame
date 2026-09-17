import type { BoardDocument } from '../../domain/document.js'
import type { Patch } from '../../domain/patch.js'
import { CommandError } from '../errors.js'
import type { CommandContext, Command } from '../types.js'
import { requireFinite, requireObject, requireUnlocked } from './shared.js'

type ResizeObjects = Extract<Command, { kind: 'ResizeObjects' }>

const MIN_SIZE = 1

export function resizeObjects(
  doc: BoardDocument,
  command: ResizeObjects,
  ctx: CommandContext,
): Patch[] {
  if (command.resizes.length === 0) {
    throw new CommandError('invalid-input', 'ResizeObjects requires at least one resize')
  }

  const patches: Patch[] = []
  for (const resize of command.resizes) {
    const object = requireUnlocked(requireObject(doc, resize.id))

    // The registry decides, not a switch on type.
    const capabilities = ctx.registry.get(object.type)?.capabilities
    if (capabilities !== undefined && !capabilities.resizable) {
      throw new CommandError('not-resizable', `Object type "${object.type}" cannot be resized`)
    }

    const { x, y, width, height, rotation } = resize.frame
    requireFinite(x, 'Frame x')
    requireFinite(y, 'Frame y')
    requireFinite(width, 'Frame width')
    requireFinite(height, 'Frame height')
    requireFinite(rotation, 'Frame rotation')

    if (width < MIN_SIZE || height < MIN_SIZE) {
      throw new CommandError('invalid-input', `Objects must be at least ${MIN_SIZE}x${MIN_SIZE}`)
    }

    patches.push({
      op: 'set',
      id: resize.id,
      path: ['frame'],
      value: { x, y, width, height, rotation },
    })
  }
  return patches
}
