import {
  applyPatches,
  createDefaultRegistry,
  deserializeBoard,
  serializeBoard,
  type BoardDocument,
  type BoardId,
  type BoardRepository,
  type BoardSummary,
  type LoadResult,
  type ObjectTypeRegistry,
  type Patch,
} from '@openframe/core'

import { STORES, promisify, transact } from './database.js'

interface StoredRecord {
  readonly id: string
  readonly savedAt: number
  readonly title: string
  readonly payload: unknown
}

/**
 * Phase 1 persistence: the user's own browser, no server, no account.
 *
 * Written against raw IndexedDB rather than a wrapper library — the surface we
 * need is four operations, and the dependency policy says not to take on a
 * package for what a few lines of stable code can do.
 *
 * `applyPatches` is satisfied here by read-modify-write. That is fine for a
 * local store and is NOT what a server adapter will do; the point of the method
 * existing now is that call sites are already written against it.
 */
export class IndexedDbBoardRepository implements BoardRepository {
  readonly #registry: ObjectTypeRegistry

  constructor(registry: ObjectTypeRegistry = createDefaultRegistry()) {
    this.#registry = registry
  }

  async getBoard(id: BoardId): Promise<LoadResult | { status: 'not-found' }> {
    const record = await transact(STORES.boards, 'readonly', (store) =>
      promisify<StoredRecord | undefined>(store.get(id) as IDBRequest<StoredRecord | undefined>),
    )
    if (record === undefined) return { status: 'not-found' }
    return deserializeBoard(record.payload, this.#registry)
  }

  async saveBoard(document: BoardDocument): Promise<void> {
    const savedAt = Date.now()
    const record: StoredRecord = {
      id: document.id,
      savedAt,
      // "Last modified" is derived HERE rather than stored on the document,
      // so it never becomes a contended field inside shared board state.
      title: document.meta.title,
      payload: serializeBoard(document, savedAt),
    }
    await transact(STORES.boards, 'readwrite', (store) => promisify(store.put(record)))
  }

  async applyPatches(id: BoardId, patches: readonly Patch[]): Promise<void> {
    const loaded = await this.getBoard(id)
    if (loaded.status !== 'ok') return
    await this.saveBoard(applyPatches(loaded.document, patches))
  }

  async listBoards(): Promise<readonly BoardSummary[]> {
    const records = await transact(STORES.boards, 'readonly', (store) =>
      promisify<StoredRecord[]>(store.getAll() as IDBRequest<StoredRecord[]>),
    )
    return records.map((record) => ({
      id: record.id as BoardId,
      title: record.title,
      updatedAt: record.savedAt,
    }))
  }

  async deleteBoard(id: BoardId): Promise<void> {
    await transact(STORES.boards, 'readwrite', (store) => promisify(store.delete(id)))
  }
}
