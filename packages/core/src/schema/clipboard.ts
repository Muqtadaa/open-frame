import { z } from 'zod'

import { unionAll, type Rect } from '../geometry/rect.js'
import type { Point } from '../geometry/point.js'
import {
  groupByParent,
  objectsInPaintOrder,
  type AssetRef,
  type BoardDocument,
} from '../domain/document.js'
import type { ObjectId } from '../domain/ids.js'
import type { AnyOpenFrameObject } from '../domain/object.js'
import type { ObjectTypeRegistry } from '../domain/registry.js'
import { PersistedObjectSchema, type PersistedObject } from './envelope.js'
import { readPersistedObject } from './read-object.js'
import { serializeObject } from './serialize.js'

/**
 * What a copy of part of a board carries, wherever it goes.
 *
 * Written into the system clipboard so that it can be pasted into another tab,
 * another board or the same one, and read back by `PasteObjects` — which holds
 * it to what loading a board is held to, because by the time it is pasted it
 * may have come from another build, another board, or something that is only
 * pretending to be OpenFrame.
 *
 * Objects are in their STORED form, at the version they were written, so an
 * older build's copy is migrated on the way in exactly as an older board is.
 */
export const CLIPBOARD_FORMAT = 'openframe.clipboard'
export const CLIPBOARD_VERSION = 1

/**
 * More than any board this product has been measured on (`board-mixed-10000`
 * holds 12,250). A paste is one command and one network message, and a
 * clipboard is not where a board should be moved wholesale.
 */
export const MAX_COPIED_OBJECTS = 20_000

const PointSchema = z.object({ x: z.number(), y: z.number() })

export const ClipboardContentSchema = z.object({
  format: z.literal(CLIPBOARD_FORMAT),
  version: z.number().int().positive(),
  /** The board it was copied from: a link to an object there means something only there. */
  board: z.string().min(1),
  /** The top-left of what was copied, which is what lands at the pointer. */
  origin: PointSchema,
  /** Each object's stored form, checked one by one when it is pasted. */
  objects: z.array(z.unknown()).max(MAX_COPIED_OBJECTS),
  /** Where each object's endpoints were, by object id and endpoint id. */
  ends: z.record(z.string(), z.record(z.string(), PointSchema)),
})

export interface ClipboardContent {
  readonly format: typeof CLIPBOARD_FORMAT
  readonly version: number
  readonly board: string
  readonly origin: Point
  readonly objects: readonly PersistedObject[]
  readonly ends: Readonly<Record<string, Readonly<Record<string, Point>>>>
}

/**
 * The selection as something that can be pasted: the objects, everything
 * inside them, and the links that touch them.
 *
 * A frame or group brings what it holds — copying a frame and getting an
 * empty frame was the old behaviour, and nobody meant it. A provenance link
 * comes along when EITHER of its ends does: whether it survives the paste is
 * decided there, where it is known which board it lands on.
 *
 * In paint order, so containers come before their contents and the copy
 * stacks the way the original did. One pass over the document, once per copy.
 */
export function copyObjects(
  doc: BoardDocument,
  ids: Iterable<ObjectId>,
  registry: ObjectTypeRegistry,
): ClipboardContent | null {
  const byParent = groupByParent(doc)
  const chosen = new Set<ObjectId>()
  const roots: AnyOpenFrameObject[] = []

  const visit = (object: AnyOpenFrameObject): void => {
    if (chosen.has(object.id)) return
    chosen.add(object.id)
    for (const child of byParent.get(object.id) ?? []) visit(child)
  }
  for (const id of ids) {
    const object = doc.objects.get(id)
    if (object === undefined || chosen.has(id)) continue
    roots.push(object)
    visit(object)
  }
  if (chosen.size === 0) return null

  for (const object of doc.objects.values()) {
    if (chosen.has(object.id)) continue
    const edge = registry.get(object.type)?.relation?.(object)
    if (edge === null || edge === undefined) continue
    if (chosen.has(edge.from) || chosen.has(edge.to)) chosen.add(object.id)
  }

  const copied = objectsInPaintOrder(doc).filter((object) => chosen.has(object.id))
  const ends: Record<string, Record<string, Point>> = {}
  for (const object of copied) {
    if (!registry.drawnFromEnds(object)) continue
    ends[object.id] = Object.fromEntries(
      registry.endpointsOf(object, doc).map((end) => [end.id, { x: end.at.x, y: end.at.y }]),
    )
  }

  return {
    format: CLIPBOARD_FORMAT,
    version: CLIPBOARD_VERSION,
    board: doc.id,
    origin: originOf(roots, ends, registry, doc),
    objects: copied.map(serializeObject),
    ends,
  }
}

/**
 * The top-left of what was copied, by each object's own bounds: a connector
 * has no extent of its own, so it counts only by its ends, and only when
 * nothing else was copied — otherwise a line running off to one side would
 * drag the paste away from the pointer.
 */
function originOf(
  roots: readonly AnyOpenFrameObject[],
  ends: Readonly<Record<string, Readonly<Record<string, Point>>>>,
  registry: ObjectTypeRegistry,
  doc: BoardDocument,
): Point {
  const placed = roots.filter((object) => registry.get(object.type)?.capabilities.spatial === true)
  const solid: Rect[] = placed
    .filter((object) => !registry.drawnFromEnds(object))
    .map((object) => registry.boundsOf(object, doc))
  const points = placed
    .filter((object) => registry.drawnFromEnds(object))
    .flatMap((object) => Object.values(ends[object.id] ?? {}))
  const box =
    unionAll(solid) ??
    unionAll(points.map((point) => ({ x: point.x, y: point.y, width: 0, height: 0 })))
  return box === null ? { x: 0, y: 0 } : { x: box.x, y: box.y }
}

/** A copy read back: what `PasteObjects` can put down, or why not. */
export type ClipboardReading =
  | {
      readonly ok: true
      readonly board: string
      readonly origin: Point
      readonly ends: Readonly<Record<string, Readonly<Record<string, Point>>>>
      /** Every object that read, upgraded to this build, in the copy's order. */
      readonly objects: readonly AnyOpenFrameObject[]
    }
  | { readonly ok: false; readonly problem: string }

/**
 * A copy from anywhere, held to what loading a board is held to: each object
 * through its type's migrations and schema (`readPersistedObject`). An object
 * that does not read is left out rather than failing the rest — one note from
 * a newer build must not cost the others.
 *
 * A type that refers to other objects is kept only if it says what a copy of
 * it refers to (`copyReferences`), and a type with no place on the board only
 * then too: reactions, votes and poll answers are things people did to an
 * object, and a copy has not been reacted to.
 */
export function readClipboard(raw: unknown, registry: ObjectTypeRegistry): ClipboardReading {
  const content = ClipboardContentSchema.safeParse(raw)
  if (!content.success) return { ok: false, problem: 'That is not something copied from a board' }
  if (content.data.version > CLIPBOARD_VERSION) {
    return { ok: false, problem: 'That was copied from a newer version of OpenFrame' }
  }

  const objects: AnyOpenFrameObject[] = []
  for (const candidate of content.data.objects) {
    const persisted = PersistedObjectSchema.safeParse(candidate)
    if (!persisted.success) continue
    const reading = readPersistedObject(persisted.data, registry)
    if (!reading.ok) continue
    const definition = registry.get(reading.object.type)
    if (definition === undefined) continue
    if (definition.copyReferences === undefined) {
      const refersToOthers = registry.dependenciesOf(reading.object).length > 0
      if (refersToOthers || !definition.capabilities.spatial) continue
    }
    objects.push(reading.object)
  }
  if (objects.length === 0) {
    return { ok: false, problem: 'Nothing in that copy could be read by this board' }
  }
  return {
    ok: true,
    board: content.data.board,
    origin: content.data.origin,
    ends: content.data.ends,
    objects,
  }
}

/**
 * The stored files a copy shows, once each: what a paste onto another board
 * has to upload before it can put the copy down.
 */
export function assetsToCarry(raw: unknown, registry: ObjectTypeRegistry): readonly AssetRef[] {
  const reading = readClipboard(raw, registry)
  if (!reading.ok) return []
  const found = new Map<string, AssetRef>()
  for (const object of reading.objects) {
    for (const ref of registry.assetsOf(object)) found.set(ref.id, ref)
  }
  return [...found.values()]
}

/**
 * The words on a copy, for anything it is pasted into that is not a board:
 * one line per object that says something, for EVERY object the copy holds
 * and not only the ones selected — a frame copied into a document is the
 * notes inside it. Each object's whole text (`searchText`), never its
 * one-line summary, which is cut short (Codex, on #75).
 *
 * Read from the copy itself, as a paste reads it, rather than from the board
 * it was made on: Shift+Mod+V pastes a copy's words, and the copy may have
 * come from another tab's board (Codex, on #76).
 */
export function wordsOf(content: ClipboardContent, registry: ObjectTypeRegistry): string[] {
  const words: string[] = []
  for (const raw of content.objects) {
    const persisted = PersistedObjectSchema.safeParse(raw)
    if (!persisted.success) continue
    const reading = readPersistedObject(persisted.data, registry)
    if (!reading.ok || registry.get(reading.object.type)?.capabilities.spatial !== true) continue
    const text = registry.describeObject(reading.object).searchText.trim()
    if (text !== '') words.push(text)
  }
  return words
}
