import type { AssetBlob, AssetId, AssetRef, AssetStore } from '@openframe/core'

import { STORES, promisify, transact } from './database.js'

interface StoredAsset {
  readonly id: string
  readonly mimeType: string
  readonly byteSize: number
  readonly bytes: ArrayBuffer
}

/**
 * The locator scheme for locally held bytes.
 *
 * An object URL cannot be the stored locator: it is minted per page load and is
 * dead the moment the tab closes, so persisting one would leave every image on
 * a reloaded board pointing at nothing. The document stores a stable
 * `idb:<id>`, and turning that into something the browser can paint is this
 * adapter's job — which is precisely the seam that lets a server adapter later
 * hand back a CDN URL without the document changing.
 */
const LOCATOR_PREFIX = 'idb:'

export function assetLocator(id: AssetId): string {
  return `${LOCATOR_PREFIX}${id}`
}

/**
 * Binary assets in the user's own browser.
 *
 * Bytes are stored as an `ArrayBuffer` rather than a `Blob`. Both are
 * structured-cloneable, but an `ArrayBuffer` is the form we already have after
 * validation and the form `AssetBlob` promises, so it avoids depending on a
 * DOM type the port deliberately does not name.
 */
export class IndexedDbAssetStore implements AssetStore {
  /**
   * Live object URLs, keyed by asset id.
   *
   * Without this cache every render that resolved an asset would mint another
   * object URL, each one pinning its blob in memory until the document is
   * discarded — a leak that grows with time on the page rather than with the
   * size of the board.
   */
  readonly #urls = new Map<AssetId, string>()

  async put(id: AssetId, blob: AssetBlob): Promise<AssetRef> {
    const bytes = await blob.arrayBuffer()
    const record: StoredAsset = {
      id,
      mimeType: blob.type,
      byteSize: blob.size,
      bytes,
    }
    await transact(STORES.assets, 'readwrite', (store) => promisify(store.put(record)))
    return { id, mimeType: blob.type, byteSize: blob.size, locator: assetLocator(id) }
  }

  async resolve(ref: AssetRef): Promise<string> {
    const cached = this.#urls.get(ref.id)
    if (cached !== undefined) return cached

    const record = await transact(STORES.assets, 'readonly', (store) =>
      promisify<StoredAsset | undefined>(store.get(ref.id) as IDBRequest<StoredAsset | undefined>),
    )
    if (record === undefined) {
      throw new Error(`Asset ${ref.id} is not in this browser's storage`)
    }

    /*
     * Re-check the cache: two callers can miss concurrently and both reach this
     * point, and the loser would otherwise overwrite — and leak — the winner's
     * URL.
     */
    const raced = this.#urls.get(ref.id)
    if (raced !== undefined) return raced

    const url = URL.createObjectURL(new Blob([record.bytes], { type: record.mimeType }))
    this.#urls.set(ref.id, url)
    return url
  }

  async delete(id: AssetId): Promise<void> {
    const url = this.#urls.get(id)
    if (url !== undefined) {
      URL.revokeObjectURL(url)
      this.#urls.delete(id)
    }
    await transact(STORES.assets, 'readwrite', (store) => promisify(store.delete(id)))
  }

  /** Releases every object URL this store has minted. */
  dispose(): void {
    for (const url of this.#urls.values()) URL.revokeObjectURL(url)
    this.#urls.clear()
  }
}
