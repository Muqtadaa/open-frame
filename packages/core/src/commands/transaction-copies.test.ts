import { describe, expect, it } from 'vitest'

import { asObjectId } from '../domain/ids.js'
import { createTestHarness } from '../testing.js'
import type { Command } from './types.js'

/**
 * A transaction copies the board once, not once per command (tracks P2).
 *
 * The dispatcher ran each command against a board with the previous ones
 * applied, and made that board by copying the whole object map — so an
 * agent's transaction of 200 single-object commands copied a 12,000-object
 * map 200 times: 406ms against 5ms for the same objects in one command
 * (`pnpm bench:mcp`). The working copy is private to the transaction, so it is
 * made once and changed in place.
 *
 * Copies are counted by swapping the global `Map` for one that counts maps
 * built at the board's size — the same probe the benchmark uses.
 */
const BOARD = 300
const NativeMap = globalThis.Map

function countingCopies<T>(threshold: number, run: () => T): { result: T; copies: number } {
  let copies = 0
  class CountingMap<K, V> extends NativeMap<K, V> {
    constructor(entries?: Iterable<readonly [K, V]> | null) {
      super(entries)
      if (this.size >= threshold) copies += 1
    }
  }
  globalThis.Map = CountingMap
  try {
    return { result: run(), copies }
  } finally {
    globalThis.Map = NativeMap
  }
}

function board() {
  const h = createTestHarness()
  const made = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: Array.from({ length: BOARD }, (_, i) => ({ type: 'sticky', x: i * 10, y: 0 })),
  })
  if (!made.ok) throw made.error
  return h
}

const one = (i: number): Command => ({
  kind: 'CreateObjects',
  objects: [{ id: asObjectId(`obj_new${String(i)}`), type: 'sticky', x: i, y: 500 }],
})

describe('a transaction of many commands', () => {
  it('copies the board once for its work and once to store it, however many commands', () => {
    const h = board()
    const { result, copies } = countingCopies(BOARD, () =>
      h.dispatcher.transact(
        'Agent',
        Array.from({ length: 20 }, (_, i) => one(i)),
      ),
    )
    if (!result.ok) throw result.error
    expect(copies).toBeLessThanOrEqual(3)
  })

  it('still shows each command the ones before it', () => {
    const h = board()
    const created = asObjectId('obj_new0')
    const result = h.dispatcher.transact('Agent', [
      one(0),
      { kind: 'MoveObjects', moves: [{ id: created, dx: 5, dy: 5 }] },
      { kind: 'MoveObjects', moves: [{ id: created, dx: 5, dy: 5 }] },
    ])
    if (!result.ok) throw result.error
    expect(h.store.getObject(created)?.frame).toMatchObject({ x: 10, y: 510 })
  })

  it('leaves the stored board alone when a later command fails', () => {
    const h = board()
    const before = h.store.getDocument()
    const size = before.objects.size
    const result = h.dispatcher.transact('Agent', [
      one(0),
      { kind: 'MoveObjects', moves: [{ id: asObjectId('obj_nothing'), dx: 1, dy: 1 }] },
    ])
    expect(result.ok).toBe(false)
    expect(h.store.getDocument()).toBe(before)
    expect(before.objects.size).toBe(size)
    expect(before.objects.has(asObjectId('obj_new0'))).toBe(false)
  })
})
