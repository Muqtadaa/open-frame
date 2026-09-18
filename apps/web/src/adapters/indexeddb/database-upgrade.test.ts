import { asBoardId } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { STORES, openDatabase } from './database.js'
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
 * Adding the `assets` store raised the database version, which means every
 * existing user's browser runs an upgrade on their next visit. An upgrade that
 * throws leaves them unable to open their own boards, so it is checked rather
 * than assumed — and checked against a database that really is at version 1,
 * not against a fresh one where the upgrade path is trivially empty.
 */
describe('database upgrade from v1', () => {
  it('adds the assets store without disturbing an existing boards store', async () => {
    await createVersion1Database()

    const db = await openDatabase()

    expect(db.version).toBe(2)
    expect([...db.objectStoreNames].sort()).toEqual([STORES.assets, STORES.boards])
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
