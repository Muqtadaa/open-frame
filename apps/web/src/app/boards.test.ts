import { asBoardId, type BoardId, type BoardRepository, type BoardSummary } from '@openframe/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createLocalBoard, describeWhen, listAllBoards, listLocalBoards } from './boards.js'
import { listMyBoards, type RemoteBoard } from './remote-boards.js'

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

/**
 * The two places a board can live, in one list.
 *
 * `listMyBoards` is mocked because the real one is a network call to a service
 * this test has no business reaching. What is NOT mocked is the merging, which
 * is where the decisions are.
 */
vi.mock('./remote-boards.js', () => ({
  listMyBoards: vi.fn(),
}))

const remote = vi.mocked(listMyBoards)

const sharedBoard = (id: string, title: string, updatedAt: number, role: RemoteBoard['role'] = 'owner'): RemoteBoard => ({
  boardId: asBoardId(id),
  title,
  role,
  accessKey: 'a'.repeat(32),
  updatedAt,
})

describe('everything you can open', () => {
  beforeEach(() => {
    remote.mockReset()
    remote.mockResolvedValue([])
  })

  it('does not ask the database when nobody is signed in', async () => {
    const { repository } = fakeRepository([summary('board_one', 1_000)])

    const listed = await listAllBoards(repository, false)

    // A round trip that can only ever return nothing, on the front door of a
    // local-first product.
    expect(remote).not.toHaveBeenCalled()
    expect(listed.map((board) => board.shared)).toEqual([false])
  })

  it('puts local and shared boards in one list, newest first', async () => {
    const { repository } = fakeRepository([summary('board_local', 1_000)])
    remote.mockResolvedValue([sharedBoard('brd_abcdefgh12345678', 'Shared', 3_000)])

    const listed = await listAllBoards(repository, true)

    expect(listed.map((board) => board.title)).toEqual(['Shared', 'board_local'])
  })

  /**
   * Sharing MOVES a board now, so this cannot arise from sharing any more.
   * It still can from a board shared before that change, whose original is
   * still sitting in this browser — and those must not each show up twice.
   */
  it('shows a board that is both local and shared exactly once', async () => {
    const { repository } = fakeRepository([summary('brd_abcdefgh12345678', 2_000)])
    remote.mockResolvedValue([sharedBoard('brd_abcdefgh12345678', 'Shared', 3_000)])

    const listed = await listAllBoards(repository, true)

    expect(listed).toHaveLength(1)
    expect(listed[0]?.shared).toBe(true)
  })

  it('carries the key that opens a shared board', async () => {
    const { repository } = fakeRepository([])
    remote.mockResolvedValue([sharedBoard('brd_abcdefgh12345678', 'Shared', 3_000, 'viewer')])

    const listed = await listAllBoards(repository, true)

    // Without it the row links to a board the room refuses, which is the whole
    // reason the key is stored beside the title.
    expect(listed[0]?.accessKey).toBe('a'.repeat(32))
    expect(listed[0]?.role).toBe('viewer')
  })

  /**
   * A board list is additive over a product that works with no account and no
   * network. A database that cannot be reached must cost the remote rows and
   * nothing else.
   */
  it('still lists local boards when the database answers with nothing', async () => {
    const { repository } = fakeRepository([summary('board_one', 1_000)])
    remote.mockResolvedValue([])

    const listed = await listAllBoards(repository, true)

    expect(listed.map((board) => board.boardId)).toEqual([asBoardId('board_one')])
  })
})
