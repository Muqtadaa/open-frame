import { asBoardId } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { DB_VERSION, STORES, openDatabase } from './database.js'
import { IndexedDbBoardRepository } from './indexeddb-board-repository.js'

/**
 * The version-1 database, as it exists in the browser of anyone who used
 * OpenFrame before images shipped: one `boards` store and nothing else.
 */
function createVersion1Database(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('openframe', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('boards', { keyPath: 'id' })
    }
    request.onsuccess = () => {
      request.result.close()
      resolve()
    }
    request.onerror = () => reject(request.error ?? new Error('setup failed'))
  })
}

/**
 * Every store added since has raised the database version, which means every
 * existing user's browser runs an upgrade on their next visit. An upgrade that
 * throws leaves them unable to open their own boards, so it is checked rather
 * than assumed — and checked against a database that really is at version 1,
 * not against a fresh one where the upgrade path is trivially empty.
 *
 * `assets` came with images; `crdt` came with local CRDT persistence on
 * 2026-09-19. The assertion names EVERY store rather than the newest one, so
 * the next bump fails here until somebody has looked at it — which is how this
 * one was caught.
 */
describe('database upgrade from v1', () => {
  it('adds every later store without disturbing an existing boards store', async () => {
    await createVersion1Database()

    const db = await openDatabase()

    expect([...db.objectStoreNames].sort()).toEqual(
      [STORES.assets, STORES.boards, STORES.crdt].sort(),
    )
    /*
     * The DECLARED version, not one derived from the store count. Those line
     * up today purely by coincidence — one store added per bump — and tying
     * them together would invent an invariant the schema never promised.
     */
    expect(db.version).toBe(DB_VERSION)
  })

  it('leaves a board saved under v1 readable', async () => {
    const repository = new IndexedDbBoardRepository()
    const id = asBoardId('board_upgraded')

    // Written through the v1-shaped database created above, then read back
    // after the upgrade has run.
    const runtime = await import('../../app/composition-root.js')
    const created = await runtime.createRuntime({ boardId: id, repository, autosaveDelayMs: 0 })
    created.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ type: 'sticky', x: 10, y: 10, data: { text: 'survived' } }],
    })
    await repository.saveBoard(created.store.getDocument())
    created.dispose()

    const loaded = await repository.getBoard(id)
    expect(loaded.status).toBe('ok')
  })
})
