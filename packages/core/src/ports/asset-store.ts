import type { AssetRef } from '../domain/document.js'
import type { AssetId } from '../domain/ids.js'

/**
 * Binary content, described structurally rather than as a DOM `Blob`.
 *
 * A browser `Blob` satisfies this interface as-is, and so does a Node buffer
 * wrapper, without `@openframe/core` ever depending on `lib.dom`. It is a small
 * illustration of the general rule: the domain names what it needs, and
 * adapters supply something that fits.
 */
export interface AssetBlob {
  readonly size: number
  readonly type: string
  arrayBuffer(): Promise<ArrayBuffer>
}

/**
 * Binary content, kept deliberately outside the document.
 *
 * Objects hold an `AssetRef`; the bytes live here. That separation is what
 * keeps saves small, undo entries cheap and — later — CRDT updates viable.
 * An object may reference an asset whose bytes have not arrived yet; the
 * renderer shows a placeholder rather than blocking.
 */
export interface AssetStore {
  put(id: AssetId, blob: AssetBlob): Promise<AssetRef>
  /** A URL usable by the renderer. May be an object URL, a CDN URL or signed. */
  resolve(ref: AssetRef): Promise<string>
  delete(id: AssetId): Promise<void>
}
