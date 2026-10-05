import { z } from 'zod'

import { unionAll, type Rect } from '../geometry/rect.js'
import type { Point } from '../geometry/point.js'
import { groupByParent, objectsInPaintOrder, type BoardDocument } from '../domain/document.js'
import type { ObjectId } from '../domain/ids.js'
import type { AnyOpenFrameObject } from '../domain/object.js'
import type { ObjectTypeRegistry } from '../domain/registry.js'
import type { PersistedObject } from './envelope.js'
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
