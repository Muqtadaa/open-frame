import { describe, expect, it, vi } from 'vitest'
import { asAssetId, asObjectId, type BoardDocument } from '@openframe/core'

import { healAssets, strandedAssets } from './heal-assets.js'

function documentWith(objects: { id: string; data: unknown }[]): BoardDocument {
  return {
    objects: new Map(
      objects.map((object) => [
        asObjectId(object.id),
        { id: asObjectId(object.id), data: object.data } as never,
      ]),
    ),
  } as unknown as BoardDocument
}

const local = {
  id: asAssetId('ast_1'),
  mimeType: 'image/png',
  byteSize: 10,
  locator: 'idb:ast_1',
}
const shared = { ...local, id: asAssetId('ast_2'), locator: 'room:ast_2' }

describe('finding images nobody else can see', () => {
  it('finds one whose bytes never left this browser', () => {
    const found = strandedAssets(documentWith([{ id: 'obj_1', data: { asset: local } }]))
    expect(found).toEqual([{ objectId: asObjectId('obj_1'), ref: local }])
  })

  it('leaves one the room already has', () => {
    expect(strandedAssets(documentWith([{ id: 'obj_1', data: { asset: shared } }]))).toEqual([])
  })

  /*
   * Asked of the DATA rather than of the type, so a later type that holds an
   * asset is lifted without naming itself here — the same reason nothing else
   * in this app switches on `object.type`.
   */
  it('ignores objects that hold no asset at all', () => {
    const found = strandedAssets(
      documentWith([
        { id: 'obj_1', data: { text: [] } },
        { id: 'obj_2', data: {} },
        { id: 'obj_3', data: { asset: { id: 'x' } } },
      ]),
    )
    expect(found).toEqual([])
  })

  it('finds every one on the board', () => {
    const found = strandedAssets(
      documentWith([
        { id: 'obj_1', data: { asset: local } },
        { id: 'obj_2', data: { asset: shared } },
        { id: 'obj_3', data: { asset: { ...local, id: asAssetId('ast_3'), locator: 'idb:ast_3' } } },
      ]),
    )
    expect(found.map((one) => one.objectId)).toEqual([asObjectId('obj_1'), asObjectId('obj_3')])
  })
})

describe('lifting them into the room', () => {
  const doc = documentWith([
    { id: 'obj_1', data: { asset: local } },
    { id: 'obj_2', data: { asset: shared } },
  ])

  it('re-uploads and repoints only the stranded one', async () => {
    const rewritten: { id: string; locator: string }[] = []
    const lifted = await healAssets(doc, {
      resolve: () => Promise.resolve('blob:local'),
      reupload: (ref) => Promise.resolve({ ...ref, locator: `room:${ref.id}` }),
      rewrite: (objectId, asset) => rewritten.push({ id: objectId, locator: asset.locator }),
      fetch: () => Promise.resolve({ blob: () => Promise.resolve(new Blob()) } as Response),
    })

    expect(lifted).toBe(1)
    expect(rewritten).toEqual([{ id: 'obj_1', locator: 'room:ast_1' }])
  })

  /*
   * An image whose bytes are in somebody ELSE's browser cannot be lifted from
   * this one. That is not an error — it is the normal state of a board
   * somebody else built — so it is skipped and left for whoever has them.
   */
  it('skips one this browser does not hold, without failing', async () => {
    const rewritten: string[] = []
    const lifted = await healAssets(doc, {
      resolve: () => Promise.reject(new Error('not here')),
      reupload: () => Promise.reject(new Error('unreachable')),
      rewrite: (objectId) => rewritten.push(objectId),
    })

    expect(lifted).toBe(0)
    expect(rewritten).toEqual([])
  })

  /*
   * A failed upload must NOT repoint the object: writing a room locator for
   * bytes the room does not have would turn an image only one person can see
   * into one nobody can.
   */
  it('does not repoint when the upload did not land', async () => {
    const rewritten: string[] = []
    const lifted = await healAssets(doc, {
      resolve: () => Promise.resolve('blob:local'),
      reupload: (ref) => Promise.resolve(ref),
      rewrite: (objectId) => rewritten.push(objectId),
      fetch: () => Promise.resolve({ blob: () => Promise.resolve(new Blob()) } as Response),
    })

    expect(lifted).toBe(0)
    expect(rewritten).toEqual([])
  })

  it('does nothing at all on a board with no stranded images', async () => {
    const only = documentWith([{ id: 'obj_2', data: { asset: shared } }])
    const resolve = vi.fn()
    await expect(
      healAssets(only, { resolve, reupload: vi.fn(), rewrite: vi.fn() }),
    ).resolves.toBe(0)
    expect(resolve).not.toHaveBeenCalled()
  })
})
