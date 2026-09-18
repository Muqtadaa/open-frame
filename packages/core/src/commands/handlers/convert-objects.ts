import type { BoardDocument } from '../../domain/document.js'
import type { Patch } from '../../domain/patch.js'
import { CommandError } from '../errors.js'
import type { Command, CommandContext } from '../types.js'
import { requireObject, requireUnlocked } from './shared.js'

type ConvertObjects = Extract<Command, { kind: 'ConvertObjects' }>

/**
 * Promotes objects to another type, IN PLACE.
 *
 * This is the "structure is earned, never demanded" principle as a command: a
 * user drops a plain note during a synthesis session and says what it was once
 * they understand it. Nothing asks them to classify before they know.
 *
 * In place is the whole point. Deleting and recreating would mint a new
 * ObjectId, and every relation pointing at the old one would be orphaned and
 * cascade-deleted (ADR 0011) — so promoting an evidence card that three
 * insights cite would silently destroy all three citations. Keeping the id also
 * keeps position, order, parent, style and creation metadata without restating
 * any of them, and makes undo a plain inverse of three `set` patches.
 */
export function convertObjects(
  doc: BoardDocument,
  command: ConvertObjects,
  ctx: CommandContext,
): Patch[] {
  if (command.ids.length === 0) {
    throw new CommandError('invalid-input', 'ConvertObjects requires at least one id')
  }

  const target = ctx.registry.get(command.toType)
  if (target === undefined) {
    throw new CommandError('unknown-type', `Unknown object type "${command.toType}"`)
  }

  /*
   * A non-spatial target would take an object off the board without deleting
   * it: it would stop being culled, hit-tested or selectable, and the only way
   * back would be an undo the user no longer has anything to click. Checked
   * through the capability rather than by naming `relation`, per rule 18.
   */
  if (!target.capabilities.spatial) {
    throw new CommandError(
      'invalid-input',
      `Cannot convert an object to "${command.toType}", which has no place on the board`,
    )
  }

  const patches: Patch[] = []

  for (const id of command.ids) {
    const object = requireUnlocked(requireObject(doc, id))
    // Converting to what it already is would still emit patches, and therefore
    // an undo entry for an action with no effect.
    if (object.type === command.toType) continue

    const source = ctx.registry.get(object.type)
    if (source === undefined) {
      throw new CommandError(
        'unknown-type',
        `Cannot convert an object of unregistered type "${object.type}"`,
      )
    }

    /*
     * A container's children belong to it. Converting a frame to a sticky would
     * leave them parented to something that cannot hold them, and the load-time
     * repair would silently reparent the lot to the root — structure lost with
     * no error anywhere.
     */
    if (source.capabilities.canHaveChildren && !target.capabilities.canHaveChildren) {
      for (const other of doc.objects.values()) {
        if (other.parentId === id) {
          throw new CommandError(
            'invalid-input',
            `Cannot convert "${id}" to "${command.toType}", which cannot hold its children`,
          )
        }
      }
    }

    const data = carryOver(object.data, target.create().data, target.validate)

    patches.push(
      { op: 'set', id, path: ['type'], value: command.toType },
      { op: 'set', id, path: ['dataVersion'], value: target.currentVersion },
      { op: 'set', id, path: ['data'], value: data },
    )
  }

  if (patches.length === 0) {
    throw new CommandError('invalid-input', 'Nothing to convert')
  }
  return patches
}

/**
 * The new payload: the target type's defaults, with whatever the old payload
 * can legitimately contribute.
 *
 * Keys are carried by NAME INTERSECTION — a key the source has and the target
 * also declares — which is what makes `text` survive a sticky becoming
 * evidence without either type knowing about the other. A per-pair carry-over
 * table would be the `switch (object.type)` rule 5 forbids, in a caller, and
 * would need an entry for every one of the eight structured types against every
 * other.
 *
 * Name intersection is a guess, though: two types can spell the same key and
 * mean different things, or hold different shapes under it. So the merged
 * result is validated against the target's own schema and the whole carry-over
 * is dropped if it does not hold. Losing a field on promotion is a visible
 * disappointment; writing a malformed object is a corrupted board.
 */
function carryOver(
  from: unknown,
  defaults: unknown,
  validate: (data: unknown) => { ok: boolean },
): unknown {
  if (typeof from !== 'object' || from === null) return defaults
  if (typeof defaults !== 'object' || defaults === null) return defaults

  const source = from as Record<string, unknown>
  const merged: Record<string, unknown> = { ...(defaults as Record<string, unknown>) }
  for (const key of Object.keys(merged)) {
    if (Object.hasOwn(source, key)) merged[key] = source[key]
  }

  return validate(merged).ok ? merged : defaults
}
