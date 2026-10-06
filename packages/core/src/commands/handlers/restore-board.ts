import type { BoardDocument } from '../../domain/document.js'
import type { ObjectId } from '../../domain/ids.js'
import type { AnyOpenFrameObject } from '../../domain/object.js'
import type { Patch } from '../../domain/patch.js'
import type { ObjectTypeRegistry } from '../../domain/registry.js'
import { CommandError } from '../errors.js'
import type { Command, CommandContext } from '../types.js'
import { readRemoteObject } from './remote-object.js'
import { MAX_TITLE } from './set-board-title.js'

type RestoreBoard = Extract<Command, { kind: 'RestoreBoard' }>

/**
 * A version's objects, read as `RestoreBoard` reads them — or `null` if any
 * one of them cannot be, or two share an id. Exported so that whatever SHOWS
 * a version (a preview, the restore button) believes exactly what the
 * restore would, and never offers one the command would refuse.
 */
export function readVersionObjects(
  objects: readonly unknown[],
  registry: ObjectTypeRegistry,
): Map<ObjectId, AnyOpenFrameObject> | null {
  const read = new Map<ObjectId, AnyOpenFrameObject>()
  for (const raw of objects) {
    const object = readRemoteObject(raw, registry)
    if (object === null || read.has(object.id)) return null
    read.set(object.id, object)
  }
  return read
}

/**
 * Puts the board back to an earlier version (ADR 0019), as ONE command: one
 * undo entry, one write, one message to everyone in the room (rules 3 and 4).
 *
 * The version arrives as `unknown` from storage this build did not write — a
 * room's snapshot holds whatever editors put there (ADR 0016) — so every
 * object is read through `readRemoteObject`, the check every remote change
 * passes. And unlike a merge, which drops what it cannot read, a restore
 * REFUSES as a whole if anything fails: a board put back with some of its
 * objects missing is a board quietly losing work, which rule 7 forbids.
 *
 * Locks are part of what is put back. A restore is the whole board as it was,
 * so a locked object neither blocks it nor survives it unchanged.
 */
export function restoreBoard(
  doc: BoardDocument,
  command: RestoreBoard,
  ctx: CommandContext,
): Patch[] {
  const restored = readVersionObjects(command.objects, ctx.registry)
  if (restored === null) {
    throw new CommandError(
      'invalid-input',
      'This version holds objects this version of OpenFrame cannot read',
    )
  }

  const patches: Patch[] = []
  for (const id of doc.objects.keys()) {
    if (!restored.has(id)) patches.push({ op: 'remove', id })
  }
  for (const [id, object] of restored) {
    const current = doc.objects.get(id)
    if (current === undefined) {
      patches.push({ op: 'add', id, object })
    } else if (JSON.stringify(current) !== JSON.stringify(object)) {
      // Replaced whole: the version is the authority on every field of it.
      patches.push({ op: 'remove', id }, { op: 'add', id, object })
    }
  }

  // A title the version cannot have held is left as it is, rather than the
  // whole restore refused over a name.
  const title = command.title.trim()
  if (title.length > 0 && title.length <= MAX_TITLE && title !== doc.meta.title) {
    patches.push({ op: 'meta', path: ['title'], value: title })
  }

  return patches
}
