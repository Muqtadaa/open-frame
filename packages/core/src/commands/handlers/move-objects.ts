import type { BoardDocument } from '../../domain/document.js'
import type { Patch } from '../../domain/patch.js'
import { CommandError } from '../errors.js'
import type { Command } from '../types.js'
import { requireFinite, requireObject, requireUnlocked } from './shared.js'

type MoveObjects = Extract<Command, { kind: 'MoveObjects' }>

/**
 * Moves objects by a delta.
 *
 * This runs ONCE per drag, on pointer-up — never per pointer-move. The live
 * position during a drag is transient interaction state held by the web app and
 * broadcast over presence; only the committed result becomes document history.
 * That single rule is what makes a 500-event drag one undo entry, one save and
 * one collaborative update.
 *
 * Children move with their parent implicitly: frames are stored relative to the
 * board, and the renderer composes parent position, so moving a container does
 * not patch its contents.
 */
export function moveObjects(doc: BoardDocument, command: MoveObjects): Patch[] {
  if (command.moves.length === 0) {
    throw new CommandError('invalid-input', 'MoveObjects requires at least one move')
  }

  const patches: Patch[] = []
  for (const move of command.moves) {
    const object = requireUnlocked(requireObject(doc, move.id))
    requireFinite(move.dx, 'Move dx')
    requireFinite(move.dy, 'Move dy')
    if (move.dx === 0 && move.dy === 0) continue

    patches.push({
      op: 'set',
      id: move.id,
      path: ['frame'],
      value: { ...object.frame, x: object.frame.x + move.dx, y: object.frame.y + move.dy },
    })
  }
  return patches
}
