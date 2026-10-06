import type { BoardId } from '@openframe/core'
import type { VersionEntry, VersionKind } from '@openframe/core/history'

import type { LocalVersion, LocalVersionStore } from '../../runtime/local-versions.js'
import { STORES, promisify, transact } from './database.js'

/**
 * A local board's versions in IndexedDB, one row each.
 *
 * The key is `<boardId>|<versionId>|<a or n>`. Everything thinning needs —
 * which board, when, and whether it is named — is in it, so the whole store is
 * listed with a key cursor and no board is ever read back to decide what to
 * keep. A version can be a few hundred kilobytes; reading fourteen days of
 * them on every page load to throw most of them away would be the cost.
 */
interface StoredVersion {
  /** The store's key path, shared with every other store (`database.ts`). */
  readonly id: string
  readonly version: LocalVersion
}

const SEPARATOR = '|'
/** Sorts after any character a version id or kind contains. */
const LAST = String.fromCharCode(0xffff)

function keyOf(boardId: BoardId, id: string, kind: VersionKind): string {
  return [boardId, id, kind === 'named' ? 'n' : 'a'].join(SEPARATOR)
}

/** The board and entry a key names, or `null` for a key this did not write. */
function parse(key: string): { boardId: BoardId; entry: VersionEntry } | null {
  // From the right: the version id and kind have fixed shapes; the board id
  // is whatever is left.
  const kindAt = key.lastIndexOf(SEPARATOR)
  const idAt = key.lastIndexOf(SEPARATOR, kindAt - 1)
  if (idAt <= 0) return null
  const id = key.slice(idAt + 1, kindAt)
  const at = Number(id.split('-')[0])
  const kind = key.slice(kindAt + 1) === 'n' ? 'named' : 'auto'
  if (!Number.isFinite(at)) return null
  return { boardId: key.slice(0, idAt) as BoardId, entry: { id, at, kind } }
}

/** Every key of one board: `<boardId>|` up to the next possible character. */
function boardRange(boardId: BoardId): IDBKeyRange {
  return IDBKeyRange.bound(`${boardId}${SEPARATOR}`, `${boardId}${SEPARATOR}${LAST}`)
}

export const indexedDbVersionStore: LocalVersionStore = {
  entries: () =>
    transact(STORES.versions, 'readonly', async (store) => {
      const keys = await promisify(store.getAllKeys())
      const byBoard = new Map<BoardId, VersionEntry[]>()
      for (const key of keys) {
        if (typeof key !== 'string') continue
        const parsed = parse(key)
        if (parsed === null) continue
        const list = byBoard.get(parsed.boardId) ?? []
        list.push(parsed.entry)
        byBoard.set(parsed.boardId, list)
      }
      return byBoard
    }),

  read: async (boardId, id) => {
    // Either kind: the caller knows the id, not whether it was named.
    for (const kind of ['auto', 'named'] as const) {
      const row = await transact(STORES.versions, 'readonly', (store) =>
        promisify(store.get(keyOf(boardId, id, kind)) as IDBRequest<StoredVersion | undefined>),
      )
      if (row !== undefined) return row.version
    }
    return null
  },

  put: (version) =>
    transact(STORES.versions, 'readwrite', async (store) => {
      const row: StoredVersion = { id: keyOf(version.boardId, version.id, version.kind), version }
      await promisify(store.put(row))
    }),

  drop: (boardId, versions) =>
    transact(STORES.versions, 'readwrite', async (store) => {
      for (const version of versions) {
        await promisify(store.delete(keyOf(boardId, version.id, version.kind)))
      }
    }),

  forget: async (boardId) => {
    try {
      await transact(STORES.versions, 'readwrite', async (store) => {
        await promisify(store.delete(boardRange(boardId)))
      })
    } catch {
      // As for the CRDT: a deleted board is gone from everywhere that matters.
    }
  },
}
