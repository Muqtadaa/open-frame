import type { AssetBlob, AssetId, AssetRef, AssetStore } from '@openframe/core'

/**
 * Images that other people can see.
 *
 * The local store keeps bytes in the uploader's own browser, which is right
 * for a reload and useless for everybody else: the document syncs carrying a
 * locator, the other client resolves it against its own storage, finds
 * nothing, and draws a placeholder. This wraps that store so the bytes also
 * reach the room, where anyone who can open the board can fetch them.
 *
 * A DECORATOR rather than a replacement. The local store is still the first
 * thing asked on every resolve, so an image the browser already holds paints
 * without a round trip and keeps painting offline — and it is still the first
 * thing written on every put, so a picture appears the instant it is dropped
 * whether or not the network agrees.
 */

const REMOTE_PREFIX = 'room:'
const LOCAL_PREFIX = 'idb:'

/** What the room needs to decide whether this caller may read or write. */
export interface RoomCredentials {
  /** The link this client arrived on. */
  readonly key: string | null
  /** The owner's key, which is never asked for the password. */
  readonly owner: string | null
  /** The token redeeming this board's password, for a board that has one. */
  readonly token: string | null
}

export function remoteLocator(id: AssetId): string {
  return `${REMOTE_PREFIX}${id}`
}

/** Whether these bytes are still only in the browser that uploaded them. */
export function isLocalOnly(ref: Pick<AssetRef, 'locator'>): boolean {
  return ref.locator.startsWith(LOCAL_PREFIX)
}

export interface RoomAssetStoreOptions {
  readonly url: (assetId: AssetId) => string
  readonly credentials: () => RoomCredentials
  /** Injected so a test can answer without a network. */
  readonly fetch?: typeof globalThis.fetch
}

export class RoomAssetStore implements AssetStore {
  readonly #local: AssetStore
  readonly #options: RoomAssetStoreOptions

  constructor(local: AssetStore, options: RoomAssetStoreOptions) {
    this.#local = local
    this.#options = options
  }

  /**
   * Stored locally first, then uploaded.
   *
   * The order is the whole design. Writing locally cannot fail for a reason
   * the user cares about and makes the image appear immediately; the upload
   * can fail for a dozen reasons and none of them should stop a picture being
   * dropped on a board.
   *
   * A FAILED upload keeps the local locator, which is not a silent loss: it is
   * exactly the state the healing pass looks for, so the next time this board
   * is opened by somebody holding the bytes, it tries again.
   */
  async put(id: AssetId, blob: AssetBlob): Promise<AssetRef> {
    const ref = await this.#local.put(id, blob)
    return (await this.#upload(id, blob)) ? { ...ref, locator: remoteLocator(id) } : ref
  }

  /**
   * The local copy if there is one, otherwise the room's — and then a local
   * copy, so the next resolve is free.
   *
   * `resolve` is called from the render path, so this must not fetch twice for
   * the same image. The local store's own URL cache is what stops it: once the
   * bytes are written there, every later resolve is a synchronous hit.
   */
  async resolve(ref: AssetRef): Promise<string> {
    try {
      return await this.#local.resolve(ref)
    } catch {
      // Not in this browser. That is the normal case for everybody except the
      // person who uploaded it.
    }

    const response = await this.#fetch(this.#options.url(ref.id), { method: 'GET' })
    if (!response.ok) {
      throw new Error(`Asset ${ref.id} is not available on this board`)
    }

    const blob = await response.blob()
    await this.#local.put(ref.id, blob)
    return this.#local.resolve(ref)
  }

  async delete(id: AssetId): Promise<void> {
    await this.#local.delete(id)
  }

  /**
   * Uploads the bytes, and reports whether they landed.
   *
   * Returns a boolean rather than throwing because the caller has already
   * succeeded at the part that matters to the person watching — the image is
   * on the board. Whether it is on the board for everyone ELSE yet is a
   * different question, and one that answers itself later.
   */
  async #upload(id: AssetId, blob: AssetBlob): Promise<boolean> {
    try {
      const response = await this.#fetch(this.#options.url(id), {
        method: 'PUT',
        headers: {
          'content-type': blob.type,
          // The room refuses an upload that will not say how big it is, since
          // a size it learns too late is not a limit.
          'content-length': String(blob.size),
          ...this.#headers(),
        },
        body: await blob.arrayBuffer(),
      })
      return response.ok
    } catch {
      return false
    }
  }

  #headers(): Record<string, string> {
    const { key, owner, token } = this.#options.credentials()
    return {
      ...(key === null ? {} : { 'x-openframe-key': key }),
      ...(owner === null ? {} : { 'x-openframe-owner': owner }),
      ...(token === null ? {} : { 'x-openframe-token': token }),
    }
  }

  #fetch(url: string, init: RequestInit): Promise<Response> {
    const request = this.#options.fetch ?? globalThis.fetch.bind(globalThis)
    return request(url, { ...init, headers: { ...this.#headers(), ...init.headers } })
  }
}
