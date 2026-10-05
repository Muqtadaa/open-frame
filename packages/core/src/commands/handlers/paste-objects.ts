import type { AssetRef, BoardDocument } from '../../domain/document.js'
import type { ObjectId } from '../../domain/ids.js'
import type { Patch } from '../../domain/patch.js'
import type { Point } from '../../geometry/point.js'
import { readClipboard } from '../../schema/clipboard.js'
import { CommandError } from '../errors.js'
import type { Command, CommandContext, NewObjectSpec } from '../types.js'
import { createObjects } from './create-objects.js'
import { requireFinite } from './shared.js'

type PasteObjects = Extract<Command, { kind: 'PasteObjects' }>

/**
 * Puts down a copy, as one command and so one undo entry.
 *
 * The content has crossed the system clipboard, so it is read here the way a
 * board is read from storage: each object through its type's migrations and
 * schema (`readPersistedObject`). An object that does not read is left out
 * rather than failing the paste — one note from a newer build must not cost
 * the rest — and a paste of which NOTHING reads is refused, so it can say so.
 *
 * What a copy refers to is rewritten by the type that does the referring
 * (`copyReferences`): to the copy when the object came along, to the original
 * when the paste lands on the board it came from and the original is still
 * there, and to nothing otherwise. A type that refers to other objects and
 * says nothing about copies is not pasted: reactions, votes and poll answers
 * are things people did to an object, and a copy has not been reacted to.
 */
export function pasteObjects(
  doc: BoardDocument,
  command: PasteObjects,
  ctx: CommandContext,
): Patch[] {
  requireFinite(command.dx, 'Paste dx')
  requireFinite(command.dy, 'Paste dy')

  const content = readClipboard(command.content, ctx.registry)
  if (!content.ok) throw new CommandError('invalid-input', content.problem)
  const kept = content.objects

  const copies = new Map<ObjectId, ObjectId>()
  for (const object of kept) copies.set(object.id, ctx.ids.objectId())

  const sameBoard = content.board === doc.id
  const to = (id: ObjectId): ObjectId | null =>
    copies.get(id) ?? (sameBoard && doc.objects.has(id) ? id : null)
  const by: Point = { x: command.dx, y: command.dy }
  const asset = (ref: AssetRef): AssetRef => command.assets?.[ref.id] ?? ref

  /*
   * Rewrite what each copy refers to. A copy that cannot stand without what
   * it referred to is dropped — and then anything that referred to IT is
   * asked again, until nothing changes. Bounded by the number of objects,
   * since every round that continues has dropped one.
   */
  const rewritten = new Map<ObjectId, Record<string, unknown>>()
  for (let settled = false; !settled;) {
    settled = true
    rewritten.clear()
    for (const object of kept) {
      if (!copies.has(object.id)) continue
      const rewrite = ctx.registry.get(object.type)?.copyReferences
      const data = object.data as Record<string, unknown>
      if (rewrite === undefined) {
        rewritten.set(object.id, data)
        continue
      }
      const ends = new Map(Object.entries(content.ends[object.id] ?? {}))
      const copy = rewrite(data, { to, ends, by, asset })
      if (copy === null) {
        copies.delete(object.id)
        settled = false
      } else {
        rewritten.set(object.id, copy)
      }
    }
  }

  const specs: NewObjectSpec[] = []
  for (const object of kept) {
    const id = copies.get(object.id)
    const data = rewritten.get(object.id)
    if (id === undefined || data === undefined) continue
    // Inside something that came along, it stays inside the copy of it.
    // Anything else lands loose: the container it was in may be on another
    // board, or may be exactly where the paste is NOT going.
    const parentId = object.parentId === null ? null : (copies.get(object.parentId) ?? null)
    specs.push({
      type: object.type,
      id,
      x: object.frame.x + command.dx,
      y: object.frame.y + command.dy,
      width: object.frame.width,
      height: object.frame.height,
      rotation: object.frame.rotation,
      hidden: object.hidden,
      parentId,
      style: object.style,
      data,
    })
  }
  if (specs.length === 0) {
    throw new CommandError('invalid-input', 'Nothing in that copy could be put on this board')
  }
  return createObjects(doc, { kind: 'CreateObjects', objects: specs }, ctx)
}
