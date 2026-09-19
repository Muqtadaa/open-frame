import { asBoardId, type BoardId, type BoardRepository, type BoardSummary } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { createLocalBoard, describeWhen, listLocalBoards } from './boards.js'

const summary = (id: string, updatedAt: number): BoardSummary => ({
  id: asBoardId(id),
  title: id,
  updatedAt,
})

function fakeRepository(boards: readonly BoardSummary[]) {
  const saved: BoardId[] = []
  const repository = {
    listBoards: () => Promise.resolve(boards),
    saveBoard: (document: { id: BoardId }) => {
      saved.push(document.id)
      return Promise.resolve()
    },
  } as unknown as BoardRepository
  return { repository, saved }
}

describe('the board list', () => {
  it('puts what you touched last at the top', async () => {
    const { repository } = fakeRepository([
      summary('board_old', 1_000),
      summary('board_new', 3_000),
      summary('board_mid', 2_000),
    ])

    const listed = await listLocalBoards(repository)

    expect(listed.map((b) => b.id)).toEqual([
      asBoardId('board_new'),
      asBoardId('board_mid'),
      asBoardId('board_old'),
    ])
  })

  it('does not mutate what the repository handed back', async () => {
    // The adapter may be returning a cached array; sorting it in place would
    // reorder somebody else's data as a side effect of rendering a list.
    const boards = [summary('board_old', 1_000), summary('board_new', 3_000)]
    const { repository } = fakeRepository(boards)

    await listLocalBoards(repository)

    expect(boards.map((b) => b.id)).toEqual([asBoardId('board_old'), asBoardId('board_new')])
  })
})

describe('starting a board', () => {
  it('writes it before handing back where it lives', async () => {
    const { repository, saved } = fakeRepository([])

    const id = await createLocalBoard(repository)

    // A board that exists only in a URL is one a reload loses.
    expect(saved).toEqual([id])
  })
})

describe('how long ago', () => {
  const now = 1_700_000_000_000
  const ago = (ms: number): string => describeWhen(now - ms, now)

  it('reads the way somebody would say it', () => {
    expect(ago(0)).toBe('just now')
    expect(ago(45_000)).toBe('just now')
    expect(ago(5 * 60_000)).toBe('5 minutes ago')
    expect(ago(60 * 60_000)).toBe('an hour ago')
    expect(ago(5 * 60 * 60_000)).toBe('5 hours ago')
    expect(ago(24 * 60 * 60_000)).toBe('yesterday')
    expect(ago(3 * 24 * 60 * 60_000)).toBe('3 days ago')
    expect(ago(31 * 24 * 60 * 60_000)).toBe('last month')
  })

  /**
   * A clock that disagrees with the server, or a board saved during a DST
   * shift, produces a future timestamp. "in -3 minutes" is the kind of thing
   * that survives to production because nobody thinks to try it.
   */
  it('does not go backwards when a timestamp is in the future', () => {
    expect(describeWhen(now + 60_000, now)).toBe('just now')
  })
})
