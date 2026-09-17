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

const DB_NAME = 'openframe'
const DB_VERSION = 1
const STORE = 'boards'

interface StoredRecord {
  readonly id: string
  readonly savedAt: number
  readonly title: string
  readonly payload: unknown
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
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
  #db: Promise<IDBDatabase> | undefined

  constructor(registry: ObjectTypeRegistry = createDefaultRegistry()) {
    this.#registry = registry
  }

  #open(): Promise<IDBDatabase> {
    this.#db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () =>
        reject(request.error ?? new Error('Could not open the OpenFrame database'))
    })
    return this.#db
  }

  async #transaction<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T> {
    const db = await this.#open()
    const tx = db.transaction(STORE, mode)
    const result = await run(tx.objectStore(STORE))
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    })
    return result
  }

  async getBoard(id: BoardId): Promise<LoadResult | { status: 'not-found' }> {
    const record = await this.#transaction('readonly', (store) =>
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
    await this.#transaction('readwrite', (store) => promisify(store.put(record)))
  }

  async applyPatches(id: BoardId, patches: readonly Patch[]): Promise<void> {
    const loaded = await this.getBoard(id)
    if (loaded.status !== 'ok') return
    await this.saveBoard(applyPatches(loaded.document, patches))
  }

  async listBoards(): Promise<readonly BoardSummary[]> {
    const records = await this.#transaction('readonly', (store) =>
      promisify<StoredRecord[]>(store.getAll() as IDBRequest<StoredRecord[]>),
    )
    return records.map((record) => ({
      id: record.id as BoardId,
      title: record.title,
      updatedAt: record.savedAt,
    }))
  }

  async deleteBoard(id: BoardId): Promise<void> {
    await this.#transaction('readwrite', (store) => promisify(store.delete(id)))
  }
}
