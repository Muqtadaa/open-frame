import { BoardRoom, documentFromSnapshot } from '@openframe/collab'
import { describe, expect, it } from 'vitest'

import { COMPACT_AFTER, DocumentStore, PART_BYTES } from './document-store.js'
import { MemoryStorage } from './testing.js'

/** The SQLite backend's largest value. */
const VALUE_CAP = 2 * 1024 * 1024

/** A room whose every change is written through the store, as the Durable Object's is. */
async function room(storage: MemoryStorage) {
  let room: BoardRoom | null = null
  const store = new DocumentStore(storage, () => room!.snapshot())
  const doc = documentFromSnapshot(await store.load())
  const writes: Promise<void>[] = []
  room = new BoardRoom({
    doc,
    onDocumentChanged: (update) => {
      writes.push(store.persist(update))
    },
  })
  const settled = () => Promise.all(writes)
  return { doc, store, settled }
}

async function reopened(storage: MemoryStorage) {
  return documentFromSnapshot(await new DocumentStore(storage, () => new Uint8Array()).load())
}

const largest = (storage: MemoryStorage): number =>
  Math.max(
    0,
    ...[...storage.values.values()].map((value) =>
      value instanceof ArrayBuffer || ArrayBuffer.isView(value) ? value.byteLength : 0,
    ),
  )

describe('a board in storage', () => {
  it('keeps an ordinary edit as one small update, and reads it back', async () => {
    const storage = new MemoryStorage({ maxValueBytes: VALUE_CAP })
    const { doc, settled } = await room(storage)
    doc.getMap('board').set('note', 'hello')
    await settled()
    expect([...(await storage.list({ prefix: 'u:' })).keys()]).toEqual(['u:00000000'])
    expect((await reopened(storage)).getMap('board').get('note')).toBe('hello')
  })

  it('keeps a board too large for one value, and reads it back whole', async () => {
    const storage = new MemoryStorage({ maxValueBytes: VALUE_CAP })
    const { doc, settled } = await room(storage)
    // One transaction, as a published board arrives: a single update over the cap.
    const big = 'x'.repeat(3 * 1024 * 1024)
    doc.getMap('board').set('big', big)
    await settled()
    expect(largest(storage)).toBeLessThanOrEqual(PART_BYTES)
    expect((await reopened(storage)).getMap('board').get('big')).toBe(big)
  })

  it('writes a compacted snapshot in parts, and leaves none behind when it shrinks', async () => {
    const storage = new MemoryStorage({ maxValueBytes: VALUE_CAP })
    const { doc, store, settled } = await room(storage)
    doc.getMap('board').set('big', 'y'.repeat(3 * 1024 * 1024))
    await settled()
    const partsWhenLarge = (await storage.list({ prefix: 's:' })).size
    expect(partsWhenLarge).toBeGreaterThan(1)

    doc.getMap('board').delete('big')
    doc.getMap('board').set('small', 'z')
    await settled()
    await store.compact()
    expect((await storage.list({ prefix: 's:' })).size).toBe(1)
    const back = await reopened(storage)
    expect(back.getMap('board').get('big')).toBeUndefined()
    expect(back.getMap('board').get('small')).toBe('z')
  })

  it('folds loose updates into the snapshot after enough of them', async () => {
    const storage = new MemoryStorage({ maxValueBytes: VALUE_CAP })
    const { doc, settled } = await room(storage)
    for (let n = 0; n < COMPACT_AFTER; n++) doc.getMap('board').set(`k${String(n)}`, n)
    await settled()
    expect((await storage.list({ prefix: 'u:' })).size).toBe(0)
    expect((await reopened(storage)).getMap('board').get('k5')).toBe(5)
  })

  it('reads a snapshot stored whole by an earlier version', async () => {
    const storage = new MemoryStorage()
    const legacy = documentFromSnapshot([])
    legacy.getMap('board').set('old', 'kept')
    const snapshot = new BoardRoom({ doc: legacy, onDocumentChanged: () => undefined }).snapshot()
    await storage.put('snapshot', snapshot.buffer.slice(0))
    expect((await reopened(storage)).getMap('board').get('old')).toBe('kept')
  })

  it('says whether it holds a board, which decides whether a room may still be claimed', async () => {
    const storage = new MemoryStorage({ maxValueBytes: VALUE_CAP })
    const store = new DocumentStore(storage, () => new Uint8Array())
    expect(await store.holdsBoard()).toBe(false)
    const { doc, settled } = await room(storage)
    doc.getMap('board').set('big', 'x'.repeat(3 * 1024 * 1024))
    await settled()
    // Only a snapshot in parts, no loose update: still a board.
    expect((await storage.list({ prefix: 'u:' })).size).toBe(0)
    expect(await store.holdsBoard()).toBe(true)
  })
})
