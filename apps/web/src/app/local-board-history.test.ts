import {
  asBoardId,
  createDefaultRegistry,
  createEmptyDocument,
  serializeBoard,
} from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { indexedDbVersionStore } from '../adapters/indexeddb/version-store.js'
import { localBoardHistory } from './local-board-history.js'
import { keepLocalHistory } from './local-history.js'

const BOARD = asBoardId('board_history_panel')
const registry = createDefaultRegistry()

describe('a local board’s history, as the panel reads it', () => {
  it('lists this board’s versions newest first and opens one as a stored board', async () => {
    const document = createEmptyDocument(BOARD, 'Plans', 1)
    for (const at of [1789000000000, 1789000005000]) {
      await indexedDbVersionStore.put({
        boardId: BOARD,
        id: `000${String(at)}-00000000`,
        at,
        kind: 'auto',
        title: 'Plans',
        payload: serializeBoard(document, at),
      })
    }
    await indexedDbVersionStore.put({
      boardId: BOARD,
      id: '0001789000009000-00000000',
      at: 1789000009000,
      kind: 'auto',
      title: 'Broken',
      payload: { not: 'a board' },
    })
    const history = localBoardHistory({
      boardId: BOARD,
      versions: indexedDbVersionStore,
      keeper: null,
      registry,
    })

    expect((await history.list())?.map((v) => v.at)).toEqual([
      1789000009000, 1789000005000, 1789000000000,
    ])
    expect(await history.open('0001789000005000-00000000')).toEqual({
      status: 'ok',
      title: 'Plans',
      objects: [],
    })
    // A version this build cannot fully read is never offered as one it can.
    expect(await history.open('0001789000009000-00000000')).toEqual({ status: 'unreadable' })
    expect(await history.open('0001789000000001-00000000')).toEqual({ status: 'missing' })
    // A board that cannot be written back keeps nothing, so nothing restores.
    expect(await history.keepNow()).toBe(false)
    expect(await history.name('Kickoff')).toBe(false)
  })

  it('deletes a named version, and refuses an automatic one', async () => {
    const board = asBoardId('board_history_forget')
    for (const [id, kind] of [
      ['0001789000000000-00000000', 'auto'],
      ['0001789000001000-00000000', 'named'],
    ] as const) {
      await indexedDbVersionStore.put({
        boardId: board,
        id,
        at: Number(id.slice(3, 16)),
        kind,
        ...(kind === 'named' ? { name: 'Kickoff' } : {}),
        title: 'Plans',
        payload: null,
      })
    }
    const keeper = keepLocalHistory({
      boardId: board,
      subscribe: () => () => undefined,
      document: () => createEmptyDocument(board, 'Plans', 1),
      versions: indexedDbVersionStore,
      schedule: () => () => undefined,
      // Within the fortnight, so opening the board thins nothing.
      now: () => 1789000002000,
    })
    const history = localBoardHistory({
      boardId: board,
      versions: indexedDbVersionStore,
      keeper,
      registry,
    })
    await keeper.idle()

    expect((await history.list())?.map((v) => v.name)).toEqual(['Kickoff', undefined])
    // Retention's, not a person's.
    expect(await history.forget('0001789000000000-00000000')).toBe(false)
    expect(await history.forget('0001789000001000-00000000')).toBe(true)
    expect((await history.list())?.map((v) => v.kind)).toEqual(['auto'])
    // Gone already.
    expect(await history.forget('0001789000001000-00000000')).toBe(false)
    keeper.dispose()
  })
})
