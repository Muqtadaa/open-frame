import type { BoardDocument } from '../../domain/document.js'
import type { Patch } from '../../domain/patch.js'
import { CommandError } from '../errors.js'
import type { Command } from '../types.js'
import { requireObject } from './shared.js'

type SetLocked = Extract<Command, { kind: 'SetLocked' }>
type SetHidden = Extract<Command, { kind: 'SetHidden' }>

/**
 * Locking is the one mutation that must work ON a locked object — otherwise
 * locking would be irreversible, which is a trap rather than a feature.
 */
export function setLocked(doc: BoardDocument, command: SetLocked): Patch[] {
  if (command.ids.length === 0) {
    throw new CommandError('invalid-input', 'SetLocked requires at least one id')
  }
  const patches: Patch[] = []
  for (const id of command.ids) {
    const object = requireObject(doc, id)
    if (object.locked === command.locked) continue
    patches.push({ op: 'set', id, path: ['locked'], value: command.locked })
  }
  return patches
}

export function setHidden(doc: BoardDocument, command: SetHidden): Patch[] {
  if (command.ids.length === 0) {
    throw new CommandError('invalid-input', 'SetHidden requires at least one id')
  }
  const patches: Patch[] = []
  for (const id of command.ids) {
    const object = requireObject(doc, id)
    if (object.hidden === command.hidden) continue
    patches.push({ op: 'set', id, path: ['hidden'], value: command.hidden })
  }
  return patches
}
