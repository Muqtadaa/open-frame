import {
  asBoardId,
  asObjectId,
  createDocumentStore,
  createEmptyDocument,
  type AssetRef,
  type BoardDocument,
  type AnyOpenFrameObject,
} from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { assetsOf, holdAssets } from './hold-assets.js'

/**
 * A shared board's pictures, held in this browser as the board opens and as
 * pictures arrive, so a copy kept of it after deletion has them all.
 */
const ref = (id: string): AssetRef =>
  ({ id, mimeType: 'image/png', byteSize: 4, locator: `room:${id}` }) as AssetRef

const picture = (id: string, asset: string): AnyOpenFrameObject =>
  ({
    id: asObjectId(id),
    type: 'image',
    data: { asset: ref(asset), alt: '' },
  }) as unknown as AnyOpenFrameObject

const note = (id: string): AnyOpenFrameObject =>
  ({ id: asObjectId(id), type: 'sticky', data: { text: [] } }) as unknown as AnyOpenFrameObject

function boardWith(...objects: AnyOpenFrameObject[]): BoardDocument {
  return {
    ...createEmptyDocument(asBoardId('brd_1'), 'Board', 1),
    objects: new Map(objects.map((object) => [object.id, object])),
  }
}

/** Lets every queued hold run, one after another. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('the pictures on a board', () => {
  it('are whatever holds an asset, whatever its type', () => {
    const doc = boardWith(picture('obj_a', 'ast_a'), note('obj_b'), picture('obj_c', 'ast_c'))
    expect(assetsOf(doc).map((asset) => asset.id)).toEqual(['ast_a', 'ast_c'])
  })
})

describe('holding a shared board’s pictures', () => {
  it('holds every picture on the board as it opens, one at a time', async () => {
    const { store, writer } = createDocumentStore(
      boardWith(picture('obj_a', 'ast_a'), note('obj_n'), picture('obj_b', 'ast_b')),
    )
    const asked: string[] = []
    let inFlight = 0
    let most = 0
    holdAssets(store, async (asset) => {
      inFlight += 1
      most = Math.max(most, inFlight)
      asked.push(asset.id)
      await settle()
      inFlight -= 1
      return true
    })
    // A picture arriving while the first is still being fetched joins the
    // queue rather than starting a second stream beside it.
    writer.replaceDocument(
      boardWith(
        picture('obj_a', 'ast_a'),
        note('obj_n'),
        picture('obj_b', 'ast_b'),
        picture('obj_c', 'ast_c'),
      ),
    )
    for (let i = 0; i < 5; i++) await settle()

    expect(asked).toEqual(['ast_a', 'ast_b', 'ast_c'])
    expect(most).toBe(1)
  })

  it('holds a picture that arrives later, and never asks twice for one it holds', async () => {
    const { store, writer } = createDocumentStore(boardWith(picture('obj_a', 'ast_a')))
    const asked: string[] = []
    holdAssets(store, (asset) => {
      asked.push(asset.id)
      return Promise.resolve(true)
    })
    await settle()

    writer.replaceDocument(boardWith(picture('obj_a', 'ast_a'), picture('obj_b', 'ast_b')))
    await settle()

    expect(asked).toEqual(['ast_a', 'ast_b'])
  })

  it('asks again at the next change for a picture the room would not give', async () => {
    const { store, writer } = createDocumentStore(boardWith(picture('obj_a', 'ast_a')))
    const asked: string[] = []
    let answer = false
    holdAssets(store, (asset) => {
      asked.push(asset.id)
      return Promise.resolve(answer)
    })
    await settle()

    answer = true
    writer.replaceDocument(boardWith(picture('obj_a', 'ast_a'), note('obj_n')))
    await settle()
    writer.replaceDocument(boardWith(picture('obj_a', 'ast_a')))
    await settle()

    expect(asked).toEqual(['ast_a', 'ast_a'])
  })

  it('asks again when a picture the room would not give is published to it', async () => {
    // Placed while its upload failed, the picture reaches this browser with a
    // locator only its uploader can read. Publishing it later rewrites that one
    // field — an edit, not an arrival — and the copy kept after a deletion must
    // still have it.
    const { store, writer } = createDocumentStore(
      boardWith(note('obj_n'), {
        ...picture('obj_a', 'ast_a'),
        data: { asset: { ...ref('ast_a'), locator: 'idb:ast_a' }, alt: '' },
      }),
    )
    const asked: string[] = []
    holdAssets(store, (asset) => {
      asked.push(asset.locator)
      return Promise.resolve(asset.locator.startsWith('room:'))
    })
    await settle()
    expect(asked).toEqual(['idb:ast_a'])

    writer.applyPatches([{ op: 'set', id: asObjectId('obj_n'), path: ['data', 'text'], value: [] }])
    await settle()
    expect(asked).toEqual(['idb:ast_a'])

    writer.applyPatches([
      {
        op: 'set',
        id: asObjectId('obj_a'),
        path: ['data', 'asset', 'locator'],
        value: 'room:ast_a',
      },
    ])
    await settle()
    expect(asked).toEqual(['idb:ast_a', 'room:ast_a'])

    // Held now, so another edit to it asks for nothing.
    writer.applyPatches([{ op: 'set', id: asObjectId('obj_a'), path: ['data', 'alt'], value: 'x' }])
    await settle()
    expect(asked).toEqual(['idb:ast_a', 'room:ast_a'])
  })

  it('carries on past a picture whose fetch throws', async () => {
    const { store } = createDocumentStore(
      boardWith(picture('obj_a', 'ast_a'), picture('obj_b', 'ast_b')),
    )
    const asked: string[] = []
    holdAssets(store, (asset) => {
      asked.push(asset.id)
      return asset.id === 'ast_a' ? Promise.reject(new Error('offline')) : Promise.resolve(true)
    })
    await settle()
    await settle()

    expect(asked).toEqual(['ast_a', 'ast_b'])
  })

  it('stops when released, so a deleted room is not asked for anything more', async () => {
    const { store, writer } = createDocumentStore(boardWith())
    const asked: string[] = []
    const release = holdAssets(store, (asset) => {
      asked.push(asset.id)
      return Promise.resolve(true)
    })
    release()

    writer.replaceDocument(boardWith(picture('obj_a', 'ast_a')))
    await settle()

    expect(asked).toEqual([])
  })
})
