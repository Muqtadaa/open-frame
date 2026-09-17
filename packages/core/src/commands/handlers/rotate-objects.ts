import type { BoardDocument } from '../../domain/document.js'
import type { Patch } from '../../domain/patch.js'
import { CommandError } from '../errors.js'
import type { Command, CommandContext } from '../types.js'
import { requireFinite, requireObject, requireUnlocked } from './shared.js'

type RotateObjects = Extract<Command, { kind: 'RotateObjects' }>

const TAU = Math.PI * 2

/** Keeps stored rotation in [0, 2π) so equality and display stay predictable. */
function normalise(radians: number): number {
  return ((radians % TAU) + TAU) % TAU
}

export function rotateObjects(
  doc: BoardDocument,
  command: RotateObjects,
  ctx: CommandContext,
): Patch[] {
  if (command.rotations.length === 0) {
    throw new CommandError('invalid-input', 'RotateObjects requires at least one rotation')
  }

  const patches: Patch[] = []
  for (const rotation of command.rotations) {
    const object = requireUnlocked(requireObject(doc, rotation.id))
    requireFinite(rotation.rotation, 'Rotation')

    // The registry decides, not a switch on type: a sticky note does not rotate.
    if (ctx.registry.get(object.type)?.capabilities.rotatable === false) {
      throw new CommandError('not-resizable', `Object type "${object.type}" cannot be rotated`)
    }

    const next = normalise(rotation.rotation)
    if (next === object.frame.rotation) continue
    patches.push({ op: 'set', id: rotation.id, path: ['frame', 'rotation'], value: next })
  }
  return patches
}
