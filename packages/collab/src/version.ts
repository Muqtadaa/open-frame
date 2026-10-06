import { objectsOf, metaOf } from './document-map.js'
import { documentFromSnapshot } from './room.js'

/**
 * One of a room's earlier versions, as the board it holds (ADR 0019).
 *
 * A version is the room's whole `Y.Doc`, so opening one means decoding it
 * here — the only package that may know Yjs exists. What comes out is NOT
 * read: the objects are exactly what editors put into the room (ADR 0016),
 * and whoever shows or restores them reads them through the same check every
 * remote object passes (`readVersionObjects` in core).
 */
export interface DecodedVersion {
  readonly title: string | null
  readonly objects: readonly unknown[]
}

/** Decodes a version's (already gunzipped) Yjs bytes. Throws on bytes that are not one. */
export function boardFromUpdate(bytes: Uint8Array): DecodedVersion {
  const doc = documentFromSnapshot([bytes])
  try {
    const title = metaOf(doc).get('title')
    return {
      title: typeof title === 'string' ? title : null,
      objects: [...objectsOf(doc).values()].map((object) => structuredClone(object as unknown)),
    }
  } finally {
    doc.destroy()
  }
}
