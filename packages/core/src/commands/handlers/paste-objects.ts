import type { BoardDocument } from '../../domain/document.js'
import type { ObjectId } from '../../domain/ids.js'
import type { AnyOpenFrameObject } from '../../domain/object.js'
import type { Patch } from '../../domain/patch.js'
import type { Point } from '../../geometry/point.js'
import { CLIPBOARD_VERSION, ClipboardContentSchema } from '../../schema/clipboard.js'
import { PersistedObjectSchema } from '../../schema/envelope.js'
import { readPersistedObject } from '../../schema/read-object.js'
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

  const content = ClipboardContentSchema.safeParse(command.content)
  if (!content.success) {
    throw new CommandError('invalid-input', 'That is not something copied from a board')
  }
  if (content.data.version > CLIPBOARD_VERSION) {
    throw new CommandError('invalid-input', 'That was copied from a newer version of OpenFrame')
  }

  const kept: AnyOpenFrameObject[] = []
  for (const raw of content.data.objects) {
    const persisted = PersistedObjectSchema.safeParse(raw)
    if (!persisted.success) continue
    const reading = readPersistedObject(persisted.data, ctx.registry)
    if (!reading.ok) continue
    const definition = ctx.registry.get(reading.object.type)
    if (definition === undefined) continue
    const refersToOthers = ctx.registry.dependenciesOf(reading.object).length > 0
    if (definition.copyReferences === undefined) {
      if (refersToOthers || !definition.capabilities.spatial) continue
    }
    kept.push(reading.object)
  }
  if (kept.length === 0) {
    throw new CommandError('invalid-input', 'Nothing in that copy could be read by this board')
  }

  const copies = new Map<ObjectId, ObjectId>()
  for (const object of kept) copies.set(object.id, ctx.ids.objectId())

  const sameBoard = content.data.board === doc.id
  const to = (id: ObjectId): ObjectId | null =>
    copies.get(id) ?? (sameBoard && doc.objects.has(id) ? id : null)
  const by: Point = { x: command.dx, y: command.dy }

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
      const ends = new Map(Object.entries(content.data.ends[object.id] ?? {}))
      const copy = rewrite(data, { to, ends, by })
      if (copy === null) {
        copies.delete(object.id)
        settled = false
      } else {
        rewritten.set(object.id, copy)
      }
    }
  }

  /*
   * The copies that can hold the ones after them. A copy names its parent,
   * and a copy is content from anywhere: a parent that does not hold
   * children, or two objects naming each other, would be a hierarchy no
   * command could have made, and `CreateObjects` takes parentage on trust.
   * A copy made here lists every container before what it holds (paint
   * order), so only a parent ALREADY put down, of a type that holds things,
   * is honoured — which makes a cycle impossible by construction.
   */
  const containers = new Map<ObjectId, ObjectId>()
  const specs: NewObjectSpec[] = []
  for (const object of kept) {
    const id = copies.get(object.id)
    const data = rewritten.get(object.id)
    if (id === undefined || data === undefined) continue
    // Inside something that came along, it stays inside the copy of it.
    // Anything else lands loose: the container it was in may be on another
    // board, or may be exactly where the paste is NOT going.
    const parentId = object.parentId === null ? null : (containers.get(object.parentId) ?? null)
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
    if (ctx.registry.get(object.type)?.capabilities.canHaveChildren === true) {
      containers.set(object.id, id)
    }
  }
  if (specs.length === 0) {
    throw new CommandError('invalid-input', 'Nothing in that copy could be put on this board')
  }
  return createObjects(doc, { kind: 'CreateObjects', objects: specs }, ctx)
}
