import type { BoardId } from '@openframe/core'
import type { CrdtStore } from '@openframe/collab'

import { STORES, transact, promisify } from './database.js'

/**
 * The board's CRDT, kept between sessions.
 *
 * Not an optimisation. Without it every session after the first began from an
 * EMPTY `Y.Doc` while the board on screen came from IndexedDB and was full,
 * and a `set` against an object the doc does not hold is correctly DROPPED —
 * which in an empty doc is every object on the board. Moving a note,
 * recolouring it or rewriting its text wrote nothing into the CRDT. Online the
 * window closed when the room's state arrived; offline it never did.
 *
 * Stored as ONE row per board holding the whole state, rather than an append
 * log of updates. The log is what a library would do and it is faster to
 * write, but it needs its own compaction and its own recovery path, and this
 * writes on the same beat as autosave — once per user action, not once per
 * keystroke. If a board ever gets big enough for that to hurt, the seam is
 * here and the port does not change.
 */

interface StoredCrdt {
  readonly id: string
  readonly state: ArrayBuffer
  readonly savedAt: number
}

export function indexedDbCrdtStore(boardId: BoardId): CrdtStore {
  /*
   * Writes are serialised through one promise chain. Yjs can emit two updates
   * in a tick, and two overlapping read-modify-writes against one key is how a
   * store ends up holding the older of them.
   */
  let writing: Promise<void> = Promise.resolve()

  return {
    async load() {
      try {
        const record = await transact(STORES.crdt, 'readonly', (store) =>
          promisify<StoredCrdt | undefined>(
            store.get(boardId) as IDBRequest<StoredCrdt | undefined>,
          ),
        )
        if (record === undefined) return null
        return new Uint8Array(record.state)
      } catch {
        /*
         * A state that cannot be read is the same as never having had one: the
         * board falls back to seeding from the local document, which is what
         * it did before this existed. Refusing to open the board would be a
         * far worse answer to a storage error.
         */
        return null
      }
    },

    save(state) {
      /*
       * Copied out of the Yjs buffer before it is queued. `encodeStateAsUpdate`
       * hands back a view, and structured-cloning it later would capture
       * whatever the underlying buffer holds by then.
       */
      const bytes = state.slice().buffer

      writing = writing
        .then(async () => {
          await transact(STORES.crdt, 'readwrite', async (store) => {
            const record: StoredCrdt = { id: boardId, state: bytes, savedAt: Date.now() }
            await promisify(store.put(record))
          })
        })
        .catch(() => {
          // Fire and forget by contract. A state that could not be written
          // costs the next reload, not this session.
        })
    },
  }
}

/** Forgets a board's CRDT, so a deleted board leaves nothing behind. */
export async function forgetCrdt(boardId: BoardId): Promise<void> {
  try {
    await transact(STORES.crdt, 'readwrite', async (store) => {
      await promisify(store.delete(boardId))
    })
  } catch {
    // Nothing to do. The board is gone from everywhere that matters.
  }
}
