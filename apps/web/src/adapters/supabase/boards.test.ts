import { asBoardId } from '@openframe/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { joinBoard, listMyBoards, recordSharedBoard } from './boards.js'
import { supabaseClient } from './client.js'

/**
 * The boundary, treated as one.
 *
 * These rows arrive from a service over a network, so rule 8 applies: validate
 * here, and never in a render path. What is being defended against is not an
 * attacker so much as a mismatch — a column renamed, a version skew, a
 * deployment half-rolled — and the cost of getting it wrong is
 * `undefined.title` inside a `map` callback, which is a blank front door.
 */

vi.mock('./client.js', () => ({ supabaseClient: vi.fn() }))

const client = vi.mocked(supabaseClient)

function answering(result: { data?: unknown; error?: unknown }): ReturnType<typeof vi.fn> {
  const rpc = vi.fn(() =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null }),
  )
  client.mockReturnValue({ rpc } as never)
  return rpc
}

const goodRow = {
  id: 'brd_abcdefgh12345678',
  title: 'Pricing research',
  role: 'owner',
  access_key: 'a'.repeat(32),
  updated_at: '2026-09-19T04:00:00Z',
}

describe('listing the boards behind an account', () => {
  beforeEach(() => {
    client.mockReset()
  })

  it('reads a well-formed row', async () => {
    answering({ data: [goodRow] })

    const [board] = await listMyBoards()

    expect(board).toEqual({
      boardId: asBoardId('brd_abcdefgh12345678'),
      title: 'Pricing research',
      role: 'owner',
      accessKey: 'a'.repeat(32),
      updatedAt: Date.parse('2026-09-19T04:00:00Z'),
      viewKey: null,
      pinned: false,
      // A board never opened on this account falls back to when it last
      // changed, so it does not sink out of sight for not having been revisited.
      openedAt: Date.parse('2026-09-19T04:00:00Z'),
    })
  })

  it('reads a pinned board and the time you last opened it', async () => {
    answering({
      data: [{ ...goodRow, pinned: true, opened_at: '2026-09-19T06:30:00Z' }],
    })

    const [board] = await listMyBoards()

    expect(board?.pinned).toBe(true)
    expect(board?.openedAt).toBe(Date.parse('2026-09-19T06:30:00Z'))
  })

  /**
   * A row from a version that does not send the column must not put a board at
   * the top of somebody's list. Anything but a true is not pinned.
   */
  it('treats anything but a true as unpinned', async () => {
    answering({ data: [{ ...goodRow, pinned: 'yes' }, { ...goodRow, id: 'brd_bbbbbbbb22222222' }] })

    const boards = await listMyBoards()

    expect(boards.map((board) => board.pinned)).toEqual([false, false])
  })

  it('drops a row it cannot read rather than rendering it', async () => {
    answering({
      data: [
        { ...goodRow, id: 'not a board id' },
        { ...goodRow, title: 42 },
        { ...goodRow, role: 'superuser' },
        null,
        'a string',
        goodRow,
      ],
    })

    const boards = await listMyBoards()

    // The good one survives; nothing else does, and nothing throws.
    expect(boards).toHaveLength(1)
    expect(boards[0]?.title).toBe('Pricing research')
  })

  /**
   * A board shared before links had roles has no key, and the room still
   * admits its link. Dropping the row would hide a board somebody owns.
   */
  it('keeps a board whose key is missing, with a null key', async () => {
    answering({ data: [{ ...goodRow, access_key: null }] })

    const [board] = await listMyBoards()

    expect(board?.accessKey).toBeNull()
    expect(board?.boardId).toBe(asBoardId('brd_abcdefgh12345678'))
  })

  it('refuses a key of the wrong shape instead of putting it in a link', async () => {
    answering({ data: [{ ...goodRow, access_key: 'nonsense' }] })

    const [board] = await listMyBoards()

    expect(board?.accessKey).toBeNull()
  })

  it('answers with nothing when the database errors', async () => {
    answering({ error: { message: 'down' } })

    await expect(listMyBoards()).resolves.toEqual([])
  })

  it('answers with nothing when the response is not a list', async () => {
    answering({ data: { not: 'a list' } })

    await expect(listMyBoards()).resolves.toEqual([])
  })

  /**
   * A build with no identity service must not construct a client, and must not
   * fail either. Such a build has no account to require, so it keeps making
   * local boards — and every board in it still opens and edits offline.
   */
  it('answers with nothing when this build has no accounts', async () => {
    client.mockReturnValue(null)

    await expect(listMyBoards()).resolves.toEqual([])
  })
})

describe('recording a shared board', () => {
  beforeEach(() => {
    client.mockReset()
  })

  it('sends the id, the title and both keys', async () => {
    const rpc = answering({})

    await recordSharedBoard({
      boardId: asBoardId('brd_abcdefgh12345678'),
      title: 'Pricing research',
      editorKey: 'e'.repeat(32),
      viewerKey: 'v'.repeat(32),
    })

    expect(rpc).toHaveBeenCalledWith('record_shared_board', {
      p_id: 'brd_abcdefgh12345678',
      p_title: 'Pricing research',
      p_editor_key: 'e'.repeat(32),
      p_viewer_key: 'v'.repeat(32),
    })
  })

  /**
   * Best effort by design. The board and both links already exist and work by
   * the time this runs; failing here costs a row in a list.
   */
  it('reports failure without throwing', async () => {
    answering({ error: { message: 'down' } })

    await expect(
      recordSharedBoard({
        boardId: asBoardId('brd_abcdefgh12345678'),
        title: 'Pricing research',
        editorKey: 'e'.repeat(32),
        viewerKey: 'v'.repeat(32),
      }),
    ).resolves.toBe(false)
  })
})

/**
 * Redeeming a link for membership.
 *
 * The reason this function exists at all is worth restating where the test
 * can see it: `board_members` allows ONLY a board's owner to insert, so a
 * person arriving on a link could never record themselves and the owner had
 * nothing to record them with. "Shared with me" was not unbuilt, it was
 * unreachable.
 */
describe('keeping a board somebody shared', () => {
  beforeEach(() => {
    client.mockReset()
  })

  it('sends the board and the key it was opened with', async () => {
    const rpc = answering({ data: 'editor' })

    const role = await joinBoard(asBoardId('brd_abcdefgh12345678'), 'e'.repeat(32))

    expect(rpc).toHaveBeenCalledWith('join_board', {
      p_id: 'brd_abcdefgh12345678',
      p_key: 'e'.repeat(32),
    })
    expect(role).toBe('editor')
  })

  /**
   * A key that opens nothing and a board that does not exist answer the same
   * way, by design — anything else is a way to ask which board ids are real,
   * one guess at a time. The client must not turn that into two outcomes.
   */
  it('reports nothing when the key does not open the board', async () => {
    answering({ data: null })

    await expect(joinBoard(asBoardId('brd_abcdefgh12345678'), 'f'.repeat(32))).resolves.toBeNull()
  })

  it('refuses a role this version does not recognise', async () => {
    answering({ data: 'administrator' })

    await expect(joinBoard(asBoardId('brd_abcdefgh12345678'), 'e'.repeat(32))).resolves.toBeNull()
  })

  it('reports nothing when the database errors', async () => {
    answering({ error: { message: 'down' } })

    await expect(joinBoard(asBoardId('brd_abcdefgh12345678'), 'e'.repeat(32))).resolves.toBeNull()
  })
})

/**
 * The view-only key, which only a board's OWNER gets back.
 *
 * It was visible exactly once — in the panel that appears the moment a board
 * is shared — so the only link you could send afterwards was the one that lets
 * people change the board. Handing an owner both leaks nothing: they already
 * hold the editor key, which is strictly the more powerful of the two.
 */
describe('the second key', () => {
  beforeEach(() => {
    client.mockReset()
  })

  it('is read for a board you own', async () => {
    answering({ data: [{ ...goodRow, role: 'owner', view_key: 'b'.repeat(32) }] })

    const [board] = await listMyBoards()

    expect(board?.accessKey).toBe('a'.repeat(32))
    expect(board?.viewKey).toBe('b'.repeat(32))
  })

  /**
   * The database withholds it from a member, and the client must not invent
   * one — an editor has no business handing out view-only links to somebody
   * else's board.
   */
  it('is null for a board that is somebody else’s', async () => {
    answering({ data: [{ ...goodRow, role: 'editor', view_key: null }] })

    const [board] = await listMyBoards()

    expect(board?.viewKey).toBeNull()
  })

  it('refuses a second key of the wrong shape rather than putting it in a link', async () => {
    answering({ data: [{ ...goodRow, role: 'owner', view_key: 'nonsense' }] })

    const [board] = await listMyBoards()

    expect(board?.viewKey).toBeNull()
  })

  /** A row from a version that does not send the column at all. */
  it('is null when the column is absent', async () => {
    answering({ data: [goodRow] })

    const [board] = await listMyBoards()

    expect(board?.viewKey).toBeNull()
  })
})
