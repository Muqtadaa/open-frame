import { asBoardId } from '@openframe/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listMyBoards, recordSharedBoard } from './boards.js'
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
    })
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
   * fail either: the board still works with no account and no network.
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
