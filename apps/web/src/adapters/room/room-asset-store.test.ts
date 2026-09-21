import { describe, expect, it, vi } from 'vitest'
import { asAssetId, type AssetBlob, type AssetId, type AssetRef, type AssetStore } from '@openframe/core'

import { isLocalOnly, RoomAssetStore } from './room-asset-store.js'

const ID = asAssetId('ast_1')

function blobOf(bytes: number, type = 'image/png'): AssetBlob {
  return {
    size: bytes,
    type,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(bytes)),
  }
}

/** A local store that can be told to have nothing, like anyone else's browser. */
class FakeLocal implements AssetStore {
  readonly held = new Map<AssetId, AssetBlob>()

  put(id: AssetId, blob: AssetBlob): Promise<AssetRef> {
    this.held.set(id, blob)
    return Promise.resolve({ id, mimeType: blob.type, byteSize: blob.size, locator: `idb:${id}` })
  }

  resolve(ref: AssetRef): Promise<string> {
    if (!this.held.has(ref.id)) return Promise.reject(new Error('not here'))
    return Promise.resolve(`blob:${ref.id}`)
  }

  delete(id: AssetId): Promise<void> {
    this.held.delete(id)
    return Promise.resolve()
  }
}

/**
 * A response carrying bytes.
 *
 * Built by hand rather than with `new Response(blob)`: the test environment's
 * `Response` cannot take a `Blob` body, and only `ok` and `blob()` are read
 * here anyway. Faking exactly what is used beats fighting a polyfill.
 */
function bytesResponse(size: number): Response {
  return {
    ok: true,
    status: 200,
    blob: () => Promise.resolve(blobOf(size) as unknown as Blob),
  } as unknown as Response
}

const credentials = () => ({ key: 'editorkey', owner: null, token: null })
const url = (id: AssetId): string => `https://rooms.test/room/b/asset/${id}`

describe('putting an image', () => {
  it('stores it locally and uploads it', async () => {
    const local = new FakeLocal()
    const fetched = vi.fn((_url: URL | RequestInfo, _init?: RequestInit) =>
      Promise.resolve(new Response(null, { status: 204 })),
    )
    const store = new RoomAssetStore(local, { url, credentials, fetch: fetched })

    const ref = await store.put(ID, blobOf(10))

    expect(local.held.has(ID)).toBe(true)
    expect(ref.locator).toBe('room:ast_1')
    const init = fetched.mock.calls[0]?.[1]
    expect(init?.method).toBe('PUT')
    const headers = (init?.headers ?? {}) as Record<string, string>
    // The room refuses an upload that will not say how big it is.
    expect(headers['content-length']).toBe('10')
    expect(headers['x-openframe-key']).toBe('editorkey')
  })

  /*
   * The local write comes FIRST and cannot be undone by a network failure. A
   * picture appears the instant it is dropped whether or not the upload works,
   * because the thing the person is watching is the board, not the network.
   */
  it('still places the image when the upload fails', async () => {
    const local = new FakeLocal()
    const store = new RoomAssetStore(local, {
      url,
      credentials,
      fetch: () => Promise.reject(new Error('offline')),
    })

    const ref = await store.put(ID, blobOf(10))
    expect(local.held.has(ID)).toBe(true)

    /*
     * And it keeps the LOCAL locator, which is not a silent loss — it is
     * exactly what the healing pass looks for, so the next open tries again.
     */
    expect(isLocalOnly(ref)).toBe(true)
  })

  it('keeps the local locator when the room refuses the upload', async () => {
    const local = new FakeLocal()
    const store = new RoomAssetStore(local, {
      url,
      credentials,
      fetch: () => Promise.resolve(new Response('no', { status: 403 })),
    })
    expect(isLocalOnly(await store.put(ID, blobOf(10)))).toBe(true)
  })
})

describe('resolving an image', () => {
  const remote: AssetRef = {
    id: ID,
    mimeType: 'image/png',
    byteSize: 10,
    locator: 'room:ast_1',
  }

  it('uses the local copy without asking the room', async () => {
    const local = new FakeLocal()
    await local.put(ID, blobOf(10))
    const fetched = vi.fn()
    const store = new RoomAssetStore(local, { url, credentials, fetch: fetched })

    await expect(store.resolve(remote)).resolves.toBe('blob:ast_1')
    expect(fetched).not.toHaveBeenCalled()
  })

  /*
   * The case the whole feature exists for: somebody else's browser, which has
   * never seen these bytes.
   */
  it('fetches from the room when this browser has never seen it', async () => {
    const local = new FakeLocal()
    const fetched = vi.fn(() => Promise.resolve(bytesResponse(4)))
    const store = new RoomAssetStore(local, { url, credentials, fetch: fetched })

    await expect(store.resolve(remote)).resolves.toBe('blob:ast_1')
    expect(fetched).toHaveBeenCalledTimes(1)
  })

  /*
   * `resolve` is called from the RENDER PATH, so fetching the same image twice
   * would be a request per frame. Caching what came back is what stops that.
   */
  it('caches what it fetched, so the render path asks once', async () => {
    const local = new FakeLocal()
    const fetched = vi.fn(() => Promise.resolve(bytesResponse(4)))
    const store = new RoomAssetStore(local, { url, credentials, fetch: fetched })

    await store.resolve(remote)
    await store.resolve(remote)
    expect(fetched).toHaveBeenCalledTimes(1)
  })

  it('reports an image the room does not have', async () => {
    const store = new RoomAssetStore(new FakeLocal(), {
      url,
      credentials,
      fetch: () => Promise.resolve(new Response('gone', { status: 404 })),
    })
    await expect(store.resolve(remote)).rejects.toThrow(/not available/)
  })
})

describe('telling the two apart', () => {
  it('knows a local-only locator from a shared one', () => {
    expect(isLocalOnly({ locator: 'idb:ast_1' })).toBe(true)
    expect(isLocalOnly({ locator: 'room:ast_1' })).toBe(false)
  })
})
