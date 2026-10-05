import {
  createSequentialIdGenerator,
  type AssetId,
  type AssetRef,
  type AssetStore,
} from '@openframe/core'
import { describe, expect, it, vi } from 'vitest'

import { AssetService, type ImageMeasurer, type UploadableFile } from './asset-service.js'

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

function file(overrides: Partial<UploadableFile> = {}): UploadableFile {
  return {
    name: 'photo.png',
    type: 'image/png',
    size: PNG_BYTES.byteLength,
    arrayBuffer: () => Promise.resolve(PNG_BYTES.buffer.slice(0)),
    ...overrides,
  }
}

class FakeAssetStore implements AssetStore {
  readonly puts: AssetId[] = []
  resolveCalls = 0
  #resolves: (id: AssetId) => Promise<string> = (id) => Promise.resolve(`blob:${id}`)

  failResolution(): void {
    this.#resolves = () => Promise.reject(new Error('not stored'))
  }

  put(id: AssetId, blob: { size: number; type: string }): Promise<AssetRef> {
    this.puts.push(id)
    return Promise.resolve({ id, mimeType: blob.type, byteSize: blob.size, locator: `idb:${id}` })
  }

  resolve(ref: AssetRef): Promise<string> {
    this.resolveCalls += 1
    return this.#resolves(ref.id)
  }

  delete(): Promise<void> {
    return Promise.resolve()
  }
}

const measure: ImageMeasurer = () => Promise.resolve({ width: 800, height: 600 })

function createService(store = new FakeAssetStore(), measurer = measure) {
  return { store, service: new AssetService(store, createSequentialIdGenerator(), measurer) }
}

describe('AssetService.upload', () => {
  it('stores the bytes and reports the intrinsic size', async () => {
    const { store, service } = createService()
    const result = await service.upload(file())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.image.naturalWidth).toBe(800)
    expect(result.image.naturalHeight).toBe(600)
    expect(result.image.name).toBe('photo.png')
    expect(store.puts).toHaveLength(1)
  })

  it('rejects a disguised SVG without storing anything', async () => {
    const { store, service } = createService()
    const svg = new TextEncoder().encode('<svg><script/></svg>')
    const result = await service.upload(file({ arrayBuffer: () => Promise.resolve(svg.buffer) }))

    expect(result.ok).toBe(false)
    expect(store.puts).toEqual([])
  })

  it('rejects a file that passes the signature check but will not decode', async () => {
    const { store, service } = createService(new FakeAssetStore(), () =>
      Promise.reject(new Error('decode failed')),
    )
    const result = await service.upload(file())

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('photo.png')
    expect(store.puts).toEqual([])
  })

  it('rejects a zero-dimension image rather than creating an invisible object', async () => {
    const { service } = createService(new FakeAssetStore(), () =>
      Promise.resolve({ width: 0, height: 0 }),
    )
    expect((await service.upload(file())).ok).toBe(false)
  })
})

describe('AssetService.urlFor', () => {
  const ref: AssetRef = {
    id: 'ast_1' as AssetId,
    mimeType: 'image/png',
    byteSize: 12,
    locator: 'idb:ast_1',
  }

  it('misses first, then answers from cache once the load lands', async () => {
    const { service } = createService()
    const listener = vi.fn()
    service.subscribe(listener)

    expect(service.urlFor(ref)).toBeUndefined()
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalled()
    })
    expect(service.urlFor(ref)).toBe('blob:ast_1')
  })

  /**
   * `urlFor` runs on every render of every image. Without the pending guard a
   * board with one image would open a fresh load per frame.
   */
  it('starts at most one load no matter how often it is called', async () => {
    const { store, service } = createService()
    service.urlFor(ref)
    service.urlFor(ref)
    service.urlFor(ref)

    await vi.waitFor(() => {
      expect(service.urlFor(ref)).toBe('blob:ast_1')
    })
    expect(store.resolveCalls).toBe(1)
  })

  it('remembers a failure instead of retrying forever', async () => {
    const store = new FakeAssetStore()
    store.failResolution()
    const { service } = createService(store)

    service.urlFor(ref)
    await vi.waitFor(() => {
      expect(service.isMissing(ref)).toBe(true)
    })

    service.urlFor(ref)
    service.urlFor(ref)
    expect(store.resolveCalls).toBe(1)
  })

  it('stops notifying an unsubscribed listener', async () => {
    const { service } = createService()
    const listener = vi.fn()
    service.subscribe(listener)()

    service.urlFor(ref)
    await vi.waitFor(() => {
      expect(service.urlFor(ref)).toBe('blob:ast_1')
    })
    expect(listener).not.toHaveBeenCalled()
  })
})

/**
 * A picture pasted from another board: its bytes are read from wherever this
 * browser holds them and uploaded again, under the same checks as a dropped
 * file. Every board in a browser shares one local store, which is what makes
 * "this browser has it" the right question.
 */
describe('AssetService.copyIn', () => {
  const elsewhere: AssetRef = {
    id: 'ast_elsewhere' as AssetId,
    mimeType: 'image/png',
    byteSize: PNG_BYTES.byteLength,
    locator: 'room:ast_elsewhere',
  }

  /** A service whose store holds `bytes`, read without object URLs. */
  function holding(bytes: Uint8Array) {
    const store = new FakeAssetStore()
    class Holding extends AssetService {
      protected override readBytes(): Promise<Blob> {
        return Promise.resolve(new Blob([bytes.slice().buffer], { type: 'image/png' }))
      }
    }
    return { store, service: new Holding(store, createSequentialIdGenerator(), measure) }
  }

  it('stores the bytes again under an id of this board', async () => {
    const { store, service } = holding(PNG_BYTES)
    const copied = await service.copyIn(elsewhere)
    expect(copied?.id).not.toBe(elsewhere.id)
    expect(store.puts).toEqual([copied?.id])
  })

  it('checks them by their content, as a dropped file is checked', async () => {
    const { store, service } = holding(new TextEncoder().encode('<svg><script/></svg>'))
    expect(await service.copyIn(elsewhere)).toBeNull()
    expect(store.puts).toEqual([])
  })

  it('answers nothing when this browser does not have them', async () => {
    const store = new FakeAssetStore()
    store.failResolution()
    const { service } = createService(store)
    expect(await service.copyIn(elsewhere)).toBeNull()
  })
})
