import type { BoardDocument } from '../../domain/document.js'
import type { AnyOpenFrameObject } from '../../domain/object.js'
import type { Patch } from '../../domain/patch.js'
import { CommandError } from '../errors.js'
import type { Command, CommandContext, NewObjectSpec } from '../types.js'
import { copyObjects } from '../../schema/clipboard.js'
import { pasteObjects } from './paste-objects.js'
import { requireFinite, requireObject } from './shared.js'

type DuplicateObjects = Extract<Command, { kind: 'DuplicateObjects' }>

/**
 * Copies of objects, `dx, dy` away — a copy and a paste in one, so a
 * duplicated frame brings what it holds, a duplicated line stays attached,
 * and the copies stand on the same evidence the originals do. It is the same
 * code a paste runs, so the two can never disagree about what a copy is.
 */
export function duplicateObjects(
  doc: BoardDocument,
  command: DuplicateObjects,
  ctx: CommandContext,
): Patch[] {
  if (command.ids.length === 0) {
    throw new CommandError('invalid-input', 'DuplicateObjects requires at least one id')
  }
  requireFinite(command.dx, 'Duplicate dx')
  requireFinite(command.dy, 'Duplicate dy')
  for (const id of command.ids) requireObject(doc, id)
  const content = copyObjects(doc, command.ids, ctx.registry)
  if (content === null) {
    throw new CommandError('invalid-input', 'DuplicateObjects found nothing to copy')
  }
  return pasteObjects(doc, { kind: 'PasteObjects', content, dx: command.dx, dy: command.dy }, ctx)
}

/**
 * What it takes to make `object` again, `dx, dy` away: its size, style and
 * data, but not its identity or its place in the tree. Shared with paste,
 * whose clipboard may hold objects the board no longer has.
 */
export function copySpec(object: AnyOpenFrameObject, dx: number, dy: number): NewObjectSpec {
  return {
    type: object.type,
    x: object.frame.x + dx,
    y: object.frame.y + dy,
    width: object.frame.width,
    height: object.frame.height,
    style: object.style,
    data: { ...(object.data as Record<string, unknown>) },
  }
}
