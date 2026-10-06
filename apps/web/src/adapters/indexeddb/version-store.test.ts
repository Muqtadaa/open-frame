import { asBoardId } from '@openframe/core'
import { versionId } from '@openframe/core/history'
import { describe, expect, it } from 'vitest'

import type { LocalVersion } from '../../runtime/local-versions.js'
import { indexedDbVersionStore as store } from './version-store.js'

const T0 = Date.UTC(2026, 9, 6, 9, 0, 0)

function version(board: string, at: number, kind: 'auto' | 'named' = 'auto'): LocalVersion {
  return {
    boardId: asBoardId(board),
    id: versionId(at, () => 0.25),
    at,
    kind,
    ...(kind === 'named' ? { name: 'Kickoff' } : {}),
    title: 'Plans',
    payload: { the: 'board' },
  }
}

/*
 * Each test uses its own board ids: the store is one database for the whole
 * file, as it is for the whole browser.
 */
describe('a local board’s versions in IndexedDB', () => {
  it('lists every board’s versions from the keys, kind included', async () => {
    await store.put(version('board_a', T0))
    await store.put(version('board_a', T0 + 1000, 'named'))
    await store.put(version('board_ab', T0 + 2000))

    const all = await store.entries()
    expect(all.get(asBoardId('board_a'))).toEqual([
      { id: versionId(T0, () => 0.25), at: T0, kind: 'auto' },
      { id: versionId(T0 + 1000, () => 0.25), at: T0 + 1000, kind: 'named' },
    ])
    // A board whose id starts with another's is its own board.
    expect(all.get(asBoardId('board_ab'))).toHaveLength(1)
  })

  it('reads one back whole, whichever kind it is', async () => {
    const named = version('board_read', T0, 'named')
    await store.put(named)
    expect(await store.read(asBoardId('board_read'), named.id)).toEqual(named)
    expect(await store.read(asBoardId('board_read'), 'nope')).toBeNull()
  })

  it('drops the versions it is given, and forgets a board without touching another', async () => {
    const first = version('board_c', T0)
    const second = version('board_c', T0 + 1000)
    await store.put(first)
    await store.put(second)
    await store.put(version('board_cd', T0))

    await store.drop(asBoardId('board_c'), [{ id: first.id, at: first.at, kind: 'auto' }])
    expect((await store.entries()).get(asBoardId('board_c'))).toHaveLength(1)

    await store.forget(asBoardId('board_c'))
    const all = await store.entries()
    expect(all.get(asBoardId('board_c'))).toBeUndefined()
    expect(all.get(asBoardId('board_cd'))).toHaveLength(1)
  })
})
