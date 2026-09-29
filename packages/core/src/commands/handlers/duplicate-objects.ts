import type { BoardDocument } from '../../domain/document.js'
import type { AnyOpenFrameObject } from '../../domain/object.js'
import type { Patch } from '../../domain/patch.js'
import { CommandError } from '../errors.js'
import type { Command, CommandContext, NewObjectSpec } from '../types.js'
import { createObjects } from './create-objects.js'
import { requireFinite, requireObject } from './shared.js'

type DuplicateObjects = Extract<Command, { kind: 'DuplicateObjects' }>

/**
 * Copies of objects, `dx, dy` away. Built from ordinary creation, so a copy
 * goes through the same validation as anything else made.
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
  const objects = command.ids.map((id) => copySpec(requireObject(doc, id), command.dx, command.dy))
  return createObjects(doc, { kind: 'CreateObjects', objects }, ctx)
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
