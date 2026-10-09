import type {
  AnyOpenFrameObject,
  BoardDocument,
  NewObjectSpec,
  ObjectId,
  ObjectTypeRegistry,
  Point,
  Rect,
} from '@openframe/core'
import {
  MAX_CLUSTER_NOTES,
  MAX_NOTE_CHARS,
  MAX_REQUEST_CHARS,
  MIN_CLUSTER_NOTES,
  planClusterLayout,
  type ClusterProposal,
  type ClusterRequest,
} from '@openframe/core/ai'

import { placeDerived } from '../scene/derived-placement.js'

/*
 * Clustering notes with AI (ADR 0018), the parts that are neither the request
 * nor the interface: which of the selected objects are notes, what is sent
 * for each, and where the result lands. Pure, so each is tested without a
 * network or a board.
 */

/**
 * Whether an object is a note the AI can sort: on the board, holding no
 * children, not a line, and saying something. Asked of the registry, never of
 * a type name (rule 5).
 */
export function noteTextOf(
  object: AnyOpenFrameObject,
  registry: ObjectTypeRegistry,
): string | null {
  const definition = registry.get(object.type)
  if (definition === undefined) return null
  if (definition.capabilities.spatial === false) return null
  if (definition.capabilities.canHaveChildren) return null
  if (definition.endpoints !== undefined) return null
  const text = definition.describe(object).searchText.replace(/\s+/g, ' ').trim()
  return text === '' ? null : text.slice(0, MAX_NOTE_CHARS)
}

/** How many of these can be clustered. O(selection), for the menu. */
export function clusterableCount(
  doc: BoardDocument,
  registry: ObjectTypeRegistry,
  ids: Iterable<ObjectId>,
): number {
  let count = 0
  for (const id of ids) {
    const object = doc.objects.get(id)
    if (object !== undefined && noteTextOf(object, registry) !== null) count++
  }
  return count
}

export type Gathered =
  | {
      readonly ok: true
      readonly request: ClusterRequest
      /** Each ref, back to the object it stands for. Ids never leave the browser. */
      readonly notes: ReadonlyMap<string, AnyOpenFrameObject>
    }
  | { readonly ok: false; readonly why: 'too-few' | 'too-many' | 'too-large' }

/**
 * What is sent: each note's text under a ref (`n1`, `n2`, …) and nothing
 * else — not its id, its place, its author or the board's name.
 */
export function gatherClusterNotes(
  doc: BoardDocument,
  registry: ObjectTypeRegistry,
  ids: Iterable<ObjectId>,
): Gathered {
  const notes = new Map<string, AnyOpenFrameObject>()
  const sent: { ref: string; text: string }[] = []
  let total = 0
  for (const id of ids) {
    const object = doc.objects.get(id)
    if (object === undefined) continue
    const text = noteTextOf(object, registry)
    if (text === null) continue
    const ref = `n${sent.length + 1}`
    notes.set(ref, object)
    sent.push({ ref, text })
    total += text.length
  }
  if (sent.length < MIN_CLUSTER_NOTES) return { ok: false, why: 'too-few' }
  if (sent.length > MAX_CLUSTER_NOTES) return { ok: false, why: 'too-many' }
  if (total > MAX_REQUEST_CHARS) return { ok: false, why: 'too-large' }
  return { ok: true, request: { notes: sent }, notes }
}

/** The space left between the notes and the themes laid out beside them. */
const CLUSTER_GAP = 80

/**
 * The objects a proposal becomes, beside the notes it was made from: a frame
 * per theme inside one outer frame, holding COPIES (the originals are never
 * touched), placed where `placeDerived` finds room — free, and on screen when
 * it can be. Laid out once to learn its size and again where it goes, with
 * the same ids, so nothing the first pass minted is wasted.
 */
export function clusterObjects(options: {
  readonly proposal: ClusterProposal
  readonly notes: ReadonlyMap<string, AnyOpenFrameObject>
  /** The notes' extent, to sit beside. */
  readonly source: Rect
  readonly occupied: readonly (Rect & { readonly container?: boolean })[]
  readonly view: Rect
  readonly ids: () => ObjectId
  readonly snap?: (at: Point) => Point
}): { readonly objects: readonly NewObjectSpec[]; readonly outer: ObjectId } {
  const minted: ObjectId[] = []
  const first = planClusterLayout(options.proposal, options.notes, { x: 0, y: 0 }, () => {
    const id = options.ids()
    minted.push(id)
    return id
  })
  const at = placeDerived(
    options.source,
    { width: first.width, height: first.height },
    options.occupied,
    options.view,
    CLUSTER_GAP,
    options.snap,
  )
  let next = 0
  const placed = planClusterLayout(options.proposal, options.notes, at, () => minted[next++]!)
  return { objects: placed.objects, outer: placed.outer }
}
