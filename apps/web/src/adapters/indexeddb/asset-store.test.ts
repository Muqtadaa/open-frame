import { asAssetId, type AssetRef } from '@openframe/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { IndexedDbAssetStore, assetLocator } from './indexeddb-asset-store.js'

const BYTES = new Uint8Array([1, 2, 3, 4, 5])

/** jsdom has no object-URL implementation, so the test supplies a counting one. */
let minted = 0
let revoked: string[] = []

beforeEach(() => {
  minted = 0
  revoked = []
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => `blob:openframe/${String(++minted)}`,
    revokeObjectURL: (url: string) => revoked.push(url),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function blob(type = 'image/png') {
  return {
    size: BYTES.byteLength,
    type,
    arrayBuffer: () => Promise.resolve(BYTES.buffer.slice(0)),
  }
}

describe('IndexedDbAssetStore', () => {
  it('returns a ref whose locator is stable across sessions', async () => {
    const id = asAssetId('ast_stable')
    const ref = await new IndexedDbAssetStore().put(id, blob())

    expect(ref).toEqual({
      id,
      mimeType: 'image/png',
      byteSize: BYTES.byteLength,
      locator: assetLocator(id),
    })
    // An object URL would be dead on the next page load; the locator must not be one.
    expect(ref.locator.startsWith('blob:')).toBe(false)
  })

  it('resolves bytes written by a DIFFERENT store instance', async () => {
    const id = asAssetId('ast_shared')
    const ref = await new IndexedDbAssetStore().put(id, blob())

    // A reload builds a new store over the same database. This is the path that
    // matters: an image must survive the tab closing.
    const url = await new IndexedDbAssetStore().resolve(ref)
    expect(url).toBe('blob:openframe/1')
  })

  /**
   * `urlFor` runs on every render of every image, so a store that minted a URL
   * per resolve would leak a pinned blob per frame.
   */
  it('mints one object URL per asset, however often it is resolved', async () => {
    const store = new IndexedDbAssetStore()
    const ref = await store.put(asAssetId('ast_once'), blob())

    const urls = await Promise.all([store.resolve(ref), store.resolve(ref), store.resolve(ref)])

    expect(new Set(urls).size).toBe(1)
    expect(minted).toBe(1)
  })

  it('mints one URL even when concurrent callers all miss the cache', async () => {
    const store = new IndexedDbAssetStore()
    const ref = await store.put(asAssetId('ast_race'), blob())

    // Started together, so every caller misses before any of them has stored a URL.
    const urls = await Promise.all(Array.from({ length: 8 }, () => store.resolve(ref)))

    expect(new Set(urls).size).toBe(1)
    // The racers that lost must not leave an unreferenced URL behind.
    expect(minted - revoked.length).toBe(1)
  })

  it('rejects rather than resolving an asset it does not hold', async () => {
    const ref: AssetRef = {
      id: asAssetId('ast_absent'),
      mimeType: 'image/png',
      byteSize: 0,
      locator: 'idb:ast_absent',
    }
    await expect(new IndexedDbAssetStore().resolve(ref)).rejects.toThrow(/not in this browser/)
  })

  it('revokes the object URL when the asset is deleted', async () => {
    const store = new IndexedDbAssetStore()
    const ref = await store.put(asAssetId('ast_gone'), blob())
    const url = await store.resolve(ref)

    await store.delete(ref.id)

    expect(revoked).toEqual([url])
    await expect(store.resolve(ref)).rejects.toThrow()
  })

  it('revokes every outstanding URL on dispose', async () => {
    const store = new IndexedDbAssetStore()
    const a = await store.put(asAssetId('ast_a'), blob())
    const b = await store.put(asAssetId('ast_b'), blob())
    await store.resolve(a)
    await store.resolve(b)

    store.dispose()

    expect(revoked).toHaveLength(2)
  })
})
