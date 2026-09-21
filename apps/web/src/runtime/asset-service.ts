import type { AssetBlob, AssetId, AssetRef, AssetStore, IdGenerator } from '@openframe/core'

import { describeFailure, validateImage } from './asset-validation.js'

export interface UploadedImage {
  readonly ref: AssetRef
  readonly naturalWidth: number
  readonly naturalHeight: number
  /** The original filename, used as the initial alt text. */
  readonly name: string
}

export type UploadResult =
  | { readonly ok: true; readonly image: UploadedImage }
  | { readonly ok: false; readonly message: string }

/** Just enough of `File` to be constructible in a test without a DOM. */
export interface UploadableFile {
  readonly name: string
  readonly type: string
  readonly size: number
  arrayBuffer(): Promise<ArrayBuffer>
}

/** Decodes far enough to learn an image's intrinsic size. Injected so tests need no browser. */
export type ImageMeasurer = (
  bytes: ArrayBuffer,
  mimeType: string,
) => Promise<{ readonly width: number; readonly height: number }>

/**
 * Measures with `createImageBitmap`, which decodes without touching the DOM and
 * — unlike an `<img>` — reports failure as a rejected promise rather than an
 * event that is easy to forget to listen for.
 */
export const measureImage: ImageMeasurer = async (bytes, mimeType) => {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType }))
  try {
    return { width: bitmap.width, height: bitmap.height }
  } finally {
    // Frees the decoded surface immediately instead of at the next GC. A 4000px
    // photograph is ~64MB decoded, so this is not a micro-optimisation.
    bitmap.close()
  }
}

/**
 * Uploads, and the synchronous URL lookup the renderer needs.
 *
 * A view cannot await. `AssetStore.resolve` is asynchronous because a server
 * adapter will have to be, so something has to bridge the two: `urlFor` answers
 * from cache immediately, returns `undefined` on a miss, and starts the load.
 * When it lands, subscribers re-render and the second call hits. The view shows
 * a placeholder in between, which is also exactly what it must do for an asset
 * whose bytes never arrive.
 */
export class AssetService {
  readonly #store: AssetStore
  readonly #ids: IdGenerator
  readonly #measure: ImageMeasurer
  readonly #urls = new Map<AssetId, string>()
  readonly #failed = new Set<AssetId>()
  readonly #pending = new Set<AssetId>()
  readonly #listeners = new Set<() => void>()
  #version = 0

  constructor(store: AssetStore, ids: IdGenerator, measure: ImageMeasurer = measureImage) {
    this.#store = store
    this.#ids = ids
    this.#measure = measure
  }

  async upload(file: UploadableFile): Promise<UploadResult> {
    const bytes = await file.arrayBuffer()
    const validation = validateImage(file.type, new Uint8Array(bytes), file.size)
    if (!validation.ok) return { ok: false, message: describeFailure(validation.failure) }

    let size: { readonly width: number; readonly height: number }
    try {
      size = await this.#measure(bytes, validation.type)
    } catch {
      // Passed the signature check but will not decode: truncated, or corrupt.
      return { ok: false, message: `${file.name} could not be read as an image.` }
    }
    if (size.width === 0 || size.height === 0) {
      return { ok: false, message: `${file.name} has no dimensions.` }
    }

    const id = this.#ids.assetId()
    const ref = await this.#store.put(id, {
      size: file.size,
      type: validation.type,
      arrayBuffer: () => Promise.resolve(bytes),
    })

    return {
      ok: true,
      image: { ref, naturalWidth: size.width, naturalHeight: size.height, name: file.name },
    }
  }

  /**
   * The URL for an asset, if it is already resolved.
   *
   * Returns `undefined` on a miss and starts a load; callers re-render through
   * `subscribe`. Safe to call every render — a load is started at most once per
   * asset, and a failed one is remembered so a missing asset does not retry on
   * every frame forever.
   */
  urlFor(ref: AssetRef): string | undefined {
    const cached = this.#urls.get(ref.id)
    if (cached !== undefined) return cached
    if (this.#pending.has(ref.id) || this.#failed.has(ref.id)) return undefined

    this.#pending.add(ref.id)
    void this.#store
      .resolve(ref)
      .then((url) => {
        this.#urls.set(ref.id, url)
      })
      .catch(() => {
        this.#failed.add(ref.id)
      })
      .finally(() => {
        this.#pending.delete(ref.id)
        this.#notify()
      })
    return undefined
  }

  /** True once a load has been tried and failed — the view shows "missing", not "loading". */
  /**
   * The bytes' URL, awaited rather than cached-or-nothing.
   *
   * `urlFor` is the render path's question and answers synchronously or not at
   * all, because a view cannot await. This is for the repair pass, which can.
   */
  resolveNow(ref: AssetRef): Promise<string> {
    return this.#store.resolve(ref)
  }

  /**
   * Stores the same asset id again, which is how a picture already on a board
   * gets published to the room.
   *
   * The id does not change, so nothing that references it has to. Only the
   * locator does — and the caller decides whether to write that back, because
   * an upload that did not land must leave the object pointing where the bytes
   * actually are.
   */
  replace(id: AssetId, blob: AssetBlob): Promise<AssetRef> {
    return this.#store.put(id, blob)
  }

  isMissing(ref: AssetRef): boolean {
    return this.#failed.has(ref.id)
  }

  /**
   * Bumped whenever a load lands. `useSyncExternalStore` needs a snapshot that
   * is stable between changes and differs after one; a counter is the smallest
   * thing that is both.
   */
  get version(): number {
    return this.#version
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #notify(): void {
    this.#version += 1
    for (const listener of this.#listeners) listener()
  }
}
