/**
 * The one place that knows OpenFrame's IndexedDB schema.
 *
 * An IndexedDB database has a single version and a single upgrade path, so two
 * adapters that each called `indexedDB.open` with their own version number
 * would fight: whichever opened second with a lower version would fail
 * outright, and whichever ran its own `onupgradeneeded` would not know about
 * the other's stores. Object stores are therefore declared together here, and
 * adapters ask for a connection rather than opening one.
 *
 * Adding a store means adding it to `STORES` and bumping `DB_VERSION`. The
 * upgrade handler creates whatever is missing, so it is correct for a database
 * at any earlier version, including one that does not exist yet.
 */
const DB_NAME = 'openframe'
export const DB_VERSION = 3

export const STORES = {
  boards: 'boards',
  assets: 'assets',
  /**
   * The CRDT state per board, so a session after the first does not begin from
   * an empty `Y.Doc` — see `crdt-store.ts` for what that cost.
   */
  crdt: 'crdt',
} as const

let connection: Promise<IDBDatabase> | undefined

export function openDatabase(): Promise<IDBDatabase> {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      for (const name of Object.values(STORES)) {
        if (!request.result.objectStoreNames.contains(name)) {
          request.result.createObjectStore(name, { keyPath: 'id' })
        }
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open the OpenFrame database'))
  })
  /*
   * A connection that FAILED is not kept. Cached, one refused open rejected
   * every read for the life of the page, so a board list that failed once
   * could never come back without a reload, whatever changed in between.
   */
  const attempt = connection
  attempt.catch(() => {
    if (connection === attempt) connection = undefined
  })
  return attempt
}

export function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

/**
 * Runs `run` against one store and resolves once the transaction COMMITS.
 *
 * Awaiting the request alone is not enough: a request can succeed and its
 * transaction still abort, which for a write would mean reporting a save that
 * did not happen.
 */
export async function transact<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDatabase()
  const tx = db.transaction(storeName, mode)
  const result = await run(tx.objectStore(storeName))
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
  return result
}
