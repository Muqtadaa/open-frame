import {
  groupByParent,
  type AnyOpenFrameObject,
  type BoardDocument,
  type NewObjectSpec,
  type ObjectId,
  type ObjectTypeRegistry,
  type Point,
  type Rect,
} from '@openframe/core'
import {
  MAX_CLUSTER_NOTES,
  MAX_REQUEST_CHARS,
  MIN_SUMMARY_NOTES,
  planSummaryLayout,
  type Summary,
  type SummaryRequest,
} from '@openframe/core/ai'

import { placeDerived } from '../scene/derived-placement.js'
import { noteTextOf } from './ai-cluster.js'

/*
 * Summarising notes with AI (ADR 0022), the parts that are neither the request
 * nor the interface: which notes a selection or a frame stands for, what is
 * sent for each, and where the summary lands. Pure, as clustering's are.
 */

/**
 * The objects a selection stands for, each once: a container stands for
 * everything inside it, however deeply. One `groupByParent` per call, never a
 * `childrenOf` per container (rule 10), and only when a container is selected.
 */
function notesWithin(
  doc: BoardDocument,
  registry: ObjectTypeRegistry,
  ids: Iterable<ObjectId>,
): AnyOpenFrameObject[] {
  const seen = new Set<ObjectId>()
  const found: AnyOpenFrameObject[] = []
  let children: Map<ObjectId | null, AnyOpenFrameObject[]> | null = null
  const visit = (object: AnyOpenFrameObject): void => {
    if (seen.has(object.id)) return
    seen.add(object.id)
    if (registry.get(object.type)?.capabilities.canHaveChildren === true) {
      children ??= groupByParent(doc)
      for (const child of children.get(object.id) ?? []) visit(child)
      return
    }
    found.push(object)
  }
  for (const id of ids) {
    const object = doc.objects.get(id)
    if (object !== undefined) visit(object)
  }
  return found
}

/** How many notes a summary of these would rest on, for the menu. */
export function summarisableCount(
  doc: BoardDocument,
  registry: ObjectTypeRegistry,
  ids: Iterable<ObjectId>,
): number {
  return notesWithin(doc, registry, ids).filter((object) => noteTextOf(object, registry) !== null)
    .length
}

export type GatheredSummary =
  | {
      readonly ok: true
      readonly request: SummaryRequest
      /** Each ref, back to the note it stands for. Ids never leave the browser. */
      readonly notes: ReadonlyMap<string, AnyOpenFrameObject>
    }
  | { readonly ok: false; readonly why: 'too-few' | 'too-many' | 'too-large' }

/**
 * What is sent: each note's text under a ref, and — when what was selected is
 * one frame — its name, so the summary can say what it is a summary of.
 */
export function gatherSummaryNotes(
  doc: BoardDocument,
  registry: ObjectTypeRegistry,
  ids: readonly ObjectId[],
): GatheredSummary {
  const notes = new Map<string, AnyOpenFrameObject>()
  const sent: { ref: string; text: string }[] = []
  let total = 0
  for (const object of notesWithin(doc, registry, ids)) {
    const text = noteTextOf(object, registry)
    if (text === null) continue
    const ref = `n${sent.length + 1}`
    notes.set(ref, object)
    sent.push({ ref, text })
    total += text.length
  }
  if (sent.length < MIN_SUMMARY_NOTES) return { ok: false, why: 'too-few' }
  if (sent.length > MAX_CLUSTER_NOTES) return { ok: false, why: 'too-many' }
  if (total > MAX_REQUEST_CHARS) return { ok: false, why: 'too-large' }
  const only = ids.length === 1 ? doc.objects.get(ids[0]!) : undefined
  const frame =
    only !== undefined && registry.get(only.type)?.capabilities.canHaveChildren === true
      ? registry.describeObject(only).gist.slice(0, 120)
      : ''
  return { ok: true, request: frame === '' ? { notes: sent } : { notes: sent, frame }, notes }
}

/** The space left between what was summarised and the summary. */
const SUMMARY_GAP = 80

/**
 * The objects a summary becomes, beside what it summarises: the text box and
 * its citations, laid out once to learn the box's size and again where
 * `placeDerived` finds room, with the same ids.
 */
export function summaryObjects(options: {
  readonly summary: Summary
  readonly notes: ReadonlyMap<string, AnyOpenFrameObject>
  readonly source: Rect
  readonly occupied: readonly (Rect & { readonly container?: boolean })[]
  readonly view: Rect
  readonly ids: () => ObjectId
  readonly snap?: (at: Point) => Point
}): { readonly objects: readonly NewObjectSpec[]; readonly box: ObjectId } {
  const minted: ObjectId[] = []
  const first = planSummaryLayout(options.summary, options.notes, { x: 0, y: 0 }, () => {
    const id = options.ids()
    minted.push(id)
    return id
  })
  const at = placeDerived(
    options.source,
    { width: first.width, height: first.height },
    options.occupied,
    options.view,
    SUMMARY_GAP,
    options.snap,
  )
  let next = 0
  const placed = planSummaryLayout(options.summary, options.notes, at, () => minted[next++]!)
  return { objects: placed.objects, box: placed.box }
}
