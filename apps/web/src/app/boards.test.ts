import { asBoardId, type BoardId, type BoardRepository, type BoardSummary } from '@openframe/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  canDelete,
  canLeave,
  createLocalBoard,
  describeWhen,
  listAllBoards,
  listLocalBoards,
  type ListedBoard,
} from './boards.js'
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

const sharedBoard = (
  id: string,
  title: string,
  updatedAt: number,
  role: RemoteBoard['role'] = 'owner',
  extra: Partial<RemoteBoard> = {},
): RemoteBoard => ({
  boardId: asBoardId(id),
  title,
  role,
  accessKey: 'a'.repeat(32),
  viewKey: role === 'owner' ? 'b'.repeat(32) : null,
  updatedAt,
  pinned: false,
  // Defaults to when it changed, the same fallback the database applies to a
  // board this account has never opened.
  openedAt: updatedAt,
  ...extra,
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

  it('puts local and shared boards in one list, most recently opened first', async () => {
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

/**
 * The order of the list, which used to be the BOARDS' order rather than yours.
 *
 * `updatedAt` is when a board last CHANGED. On a shared board that is somebody
 * else's typing, so a collaborator working at midnight rearranged your list
 * while you slept. What a list of boards is for is "what was I doing", and
 * that is a fact about the reader.
 */
describe('the order of a board list', () => {
  beforeEach(() => {
    remote.mockReset()
    remote.mockResolvedValue([])
  })

  it('puts a pinned board above a more recent unpinned one', async () => {
    const { repository } = fakeRepository([])
    remote.mockResolvedValue([
      sharedBoard('brd_aaaaaaaa11111111', 'Fresh', 9_000),
      sharedBoard('brd_bbbbbbbb22222222', 'Pinned', 1_000, 'owner', {
        pinned: true,
        openedAt: 1_000,
      }),
    ])

    const listed = await listAllBoards(repository, true)

    // A pin that loses to a fresh edit is not a pin.
    expect(listed.map((board) => board.title)).toEqual(['Pinned', 'Fresh'])
  })

  /**
   * The one that would pass with the feature deleted if the fixtures agreed.
   * `openedAt` and `updatedAt` are deliberately in OPPOSITE orders here, so
   * sorting on the wrong one is visible.
   */
  it('orders by when YOU opened it, not by when it last changed', async () => {
    const { repository } = fakeRepository([])
    remote.mockResolvedValue([
      // Changed most recently, opened by you longest ago.
      sharedBoard('brd_aaaaaaaa11111111', 'Someone else was busy', 9_000, 'editor', {
        openedAt: 1_000,
      }),
      // Barely touched, but it is what you had open.
      sharedBoard('brd_bbbbbbbb22222222', 'What you were doing', 2_000, 'owner', {
        openedAt: 8_000,
      }),
    ])

    const listed = await listAllBoards(repository, true)

    expect(listed.map((board) => board.title)).toEqual([
      'What you were doing',
      'Someone else was busy',
    ])
  })

  it('still shows how long ago it was EDITED, which is a different fact', async () => {
    const { repository } = fakeRepository([])
    remote.mockResolvedValue([
      sharedBoard('brd_aaaaaaaa11111111', 'A board', 5_000, 'owner', { openedAt: 1_000 }),
    ])

    const listed = await listAllBoards(repository, true)

    // Demoted from the sort key, not removed: it is worth knowing.
    expect(listed[0]?.updatedAt).toBe(5_000)
    expect(listed[0]?.openedAt).toBe(1_000)
  })
})

/**
 * Two verbs that look alike in a list and must never be one control.
 */
describe('what you may do to a board', () => {
  const listed = (over: Partial<ListedBoard>): ListedBoard => ({
    boardId: asBoardId('brd_aaaaaaaa11111111'),
    title: 'A board',
    updatedAt: 0,
    shared: true,
    role: 'owner',
    accessKey: null,
    viewKey: null,
    pinned: false,
    openedAt: 0,
    ...over,
  })

  it('lets an owner delete and not leave', () => {
    const board = listed({ role: 'owner' })
    expect(canDelete(board)).toBe(true)
    // There would be nobody left to own it; the board would be unreachable
    // rather than deleted.
    expect(canLeave(board)).toBe(false)
  })

  it('lets a member leave and not delete', () => {
    for (const role of ['editor', 'viewer'] as const) {
      const board = listed({ role })
      expect(canDelete(board)).toBe(false)
      expect(canLeave(board)).toBe(true)
    }
  })

  /** Nobody else is involved, so there is nothing to leave and nothing to warn about. */
  it('lets a local board be deleted, with nothing to leave', () => {
    const board = listed({ shared: false, role: null })
    expect(canDelete(board)).toBe(true)
    expect(canLeave(board)).toBe(false)
  })
})

/**
 * A board that lives in a room is never "in this browser".
 *
 * Opening somebody's link builds a runtime for that board, and `createRuntime`
 * writes an empty document the moment it cannot find one — so a link you had
 * merely LOOKED at left a row in your list called "Untitled board", tagged
 * `this browser`, pointing at a board that was neither untitled nor yours.
 */
describe('a cached copy of somebody else’s board', () => {
  beforeEach(() => {
    remote.mockReset()
    remote.mockResolvedValue([])
  })

  it('is not listed as a board in this browser', async () => {
    // Exactly what opening a shared link leaves behind.
    const { repository } = fakeRepository([summary('brd_abcdefgh12345678', 1_000)])

    const listed = await listAllBoards(repository, true)

    expect(listed).toEqual([])
  })

  /** Signed out changes nothing: it is still a room's board, not this browser's. */
  it('is not listed for a guest either', async () => {
    const { repository } = fakeRepository([summary('brd_abcdefgh12345678', 1_000)])

    await expect(listAllBoards(repository, false)).resolves.toEqual([])
  })

  /**
   * When the server DOES know you have it, it appears once — with the title
   * the room holds rather than the placeholder the cache was created with.
   */
  it('appears once, named, when the server says it is yours', async () => {
    const { repository } = fakeRepository([summary('brd_abcdefgh12345678', 1_000)])
    remote.mockResolvedValue([
      sharedBoard('brd_abcdefgh12345678', 'Checkout research', 3_000, 'editor'),
    ])

    const listed = await listAllBoards(repository, true)

    expect(listed).toHaveLength(1)
    expect(listed[0]?.title).toBe('Checkout research')
    expect(listed[0]?.shared).toBe(true)
  })

  /** And a real local board is untouched by the filter. */
  it('still lists a board that really is only in this browser', async () => {
    const { repository } = fakeRepository([summary('board_mine', 1_000)])

    const listed = await listAllBoards(repository, true)

    expect(listed.map((board) => board.boardId)).toEqual([asBoardId('board_mine')])
  })
})
