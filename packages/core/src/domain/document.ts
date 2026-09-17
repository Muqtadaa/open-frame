import type { AssetId, BoardId, ObjectId } from './ids.js'
import type { AnyOpenFrameObject } from './object.js'

/**
 * A reference to binary content. The BYTES are never in the document — only
 * this descriptor. Embedding image data in the board would bloat every save,
 * every undo entry and (later) every CRDT update.
 *
 * `locator` is opaque to the domain; the AssetStore port resolves it.
 */
export interface AssetRef {
  readonly id: AssetId
  readonly mimeType: string
  readonly byteSize: number
  readonly width?: number
  readonly height?: number
  /** Resolved by the AssetStore port. Never a `data:` URI. */
  readonly locator: string
}

export interface BoardDocumentMeta {
  readonly title: string
  readonly createdAt: number
}

/**
 * The canonical board.
 *
 * Objects live in a FLAT map, not a tree. Hierarchy is derived from each
 * object's `parentId` and sibling order. A literal tree would be easier to read
 * and considerably worse in every other way: subtree moves become deep
 * rewrites, lookups become traversals, and — decisively — trees merge badly
 * under concurrent editing, whereas a flat map with parent pointers needs only
 * a cycle check.
 */
export interface BoardDocument {
  readonly id: BoardId
  readonly objects: ReadonlyMap<ObjectId, AnyOpenFrameObject>
  readonly assets: ReadonlyMap<AssetId, AssetRef>
  readonly meta: BoardDocumentMeta
}

export function createEmptyDocument(id: BoardId, title: string, createdAt: number): BoardDocument {
  return {
    id,
    objects: new Map(),
    assets: new Map(),
    meta: { title, createdAt },
  }
}

export function getObject(doc: BoardDocument, id: ObjectId): AnyOpenFrameObject | undefined {
  return doc.objects.get(id)
}

/** Direct children of a container, in sibling order. `null` means the board root. */
const byOrder = (a: AnyOpenFrameObject, b: AnyOpenFrameObject): number =>
  a.order < b.order ? -1 : a.order > b.order ? 1 : 0

/**
 * Direct children of one container, in sibling order.
 *
 * O(n) per call. Fine for a single lookup; use `groupByParent` when you need
 * every container's children, or this becomes O(n²).
 */
export function childrenOf(doc: BoardDocument, parentId: ObjectId | null): AnyOpenFrameObject[] {
  const children: AnyOpenFrameObject[] = []
  for (const object of doc.objects.values()) {
    if (object.parentId === parentId) children.push(object)
  }
  children.sort(byOrder)
  return children
}

/**
 * Every object grouped by its parent, each group in sibling order.
 *
 * One pass plus one sort per group, rather than a full document scan per
 * container. The naive version — calling `childrenOf` once per object — is
 * O(n²), which on a flat 10,000-object board is ~100 million iterations and
 * showed up as 600ms frame spikes while panning.
 */
export function groupByParent(doc: BoardDocument): Map<ObjectId | null, AnyOpenFrameObject[]> {
  const byParent = new Map<ObjectId | null, AnyOpenFrameObject[]>()
  for (const object of doc.objects.values()) {
    const siblings = byParent.get(object.parentId)
    if (siblings === undefined) byParent.set(object.parentId, [object])
    else siblings.push(object)
  }
  for (const siblings of byParent.values()) siblings.sort(byOrder)
  return byParent
}

/**
 * Every object in the document in paint order: parents before children,
 * siblings in fractional-index order. This is the order the renderer draws in.
 */
export function objectsInPaintOrder(doc: BoardDocument): AnyOpenFrameObject[] {
  const byParent = groupByParent(doc)
  const result: AnyOpenFrameObject[] = []
  // A cycle would otherwise recurse forever and hang the renderer. Load-time
  // repair removes cycles, but a document can acquire one at runtime (and,
  // later, through a concurrent reparent) — the renderer must not be the thing
  // that discovers it.
  const seen = new Set<ObjectId>()

  const visit = (parentId: ObjectId | null): void => {
    for (const child of byParent.get(parentId) ?? []) {
      if (seen.has(child.id)) continue
      seen.add(child.id)
      result.push(child)
      visit(child.id)
    }
  }

  visit(null)
  return result
}

/** Walks up the parent chain. Stops safely if the document contains a cycle. */
export function ancestorsOf(doc: BoardDocument, id: ObjectId): ObjectId[] {
  const ancestors: ObjectId[] = []
  const seen = new Set<ObjectId>([id])
  let current = doc.objects.get(id)?.parentId ?? null
  while (current !== null && !seen.has(current)) {
    ancestors.push(current)
    seen.add(current)
    current = doc.objects.get(current)?.parentId ?? null
  }
  return ancestors
}
