import { asBoardId, richFromPlain } from '@openframe/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MemoryBoardRepository } from '../adapters/memory/memory-board-repository.js'
import { deleteBoardEverywhere, leaveBoard, renameBoard } from './board-lifecycle.js'
import { createRuntime } from './composition-root.js'
import { deleteRemoteBoard, leaveRemoteBoard, renameRemoteBoard } from './remote-boards.js'

/**
 * Removing a board is three removals, and the ORDER is the design.
 *
 * A board can exist in three places: this browser, a database row, and a
 * Durable Object holding the collaborative document. Deleting some of them
 * produces a board that is gone from the list and still readable by anybody
 * with a link — the worst of both.
 *
 * The order is the OPPOSITE of sharing's. Sharing writes the new thing first,
 * so a failure leaves the original intact. Deleting destroys the furthest
 * thing first, so a failure leaves the board listed and openable: a row you
 * can still see and retry is recoverable, a room nobody can reach is not.
 */

vi.mock('./remote-boards.js', () => ({
  deleteRemoteBoard: vi.fn(() => Promise.resolve(true)),
  leaveRemoteBoard: vi.fn(() => Promise.resolve(true)),
  renameRemoteBoard: vi.fn(() => Promise.resolve(true)),
}))

const remoteDelete = vi.mocked(deleteRemoteBoard)
const remoteLeave = vi.mocked(leaveRemoteBoard)
const remoteRename = vi.mocked(renameRemoteBoard)

const SHARED = asBoardId('brd_abcdefgh12345678')
const LOCAL = asBoardId('board_alone')
const KEY = 'e'.repeat(32)

function roomAnswers(status: number): ReturnType<typeof vi.fn> {
  const fetcher = vi.fn(() => Promise.resolve({ ok: status < 400, status } as Response))
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}

function roomUnreachable(): void {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
}

async function boardOnDisk(id = SHARED) {
  const repository = new MemoryBoardRepository()
  const runtime = await createRuntime({ boardId: id, repository, autosaveDelayMs: 0 })
  runtime.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [{ type: 'sticky', x: 0, y: 0, data: { text: richFromPlain('here') } }],
  })
  await runtime.flush()
  runtime.dispose()
  return repository
}

describe('deleting a board', () => {
  beforeEach(() => {
    remoteDelete.mockReset()
    remoteDelete.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('destroys the room, the row and the local copy', async () => {
    const fetcher = roomAnswers(200)
    const repository = await boardOnDisk()

    const outcome = await deleteBoardEverywhere(repository, {
      boardId: SHARED,
      shared: true,
      accessKey: KEY,
    })

    expect(outcome).toEqual({ ok: true })
    expect(remoteDelete).toHaveBeenCalledWith(SHARED)
    expect(await repository.getBoard(SHARED)).toMatchObject({ status: 'not-found' })

    // The key travels in the BODY. A credential in a query string is a
    // credential in an access log, and this is the destructive endpoint.
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/room/${SHARED}/destroy`)
    expect(url).not.toContain(KEY)
    expect(init.body).toBe(JSON.stringify({ key: KEY }))
  })

  /**
   * THE ORDER, as an executable statement. A room that cannot be reached must
   * leave the row and the local copy exactly where they are, so the person can
   * try again rather than be left with a board they can neither see nor reach.
   */
  it('keeps the row and the local copy when the room cannot be reached', async () => {
    roomUnreachable()
    const repository = await boardOnDisk()

    const outcome = await deleteBoardEverywhere(repository, {
      boardId: SHARED,
      shared: true,
      accessKey: KEY,
    })

    expect(outcome.ok).toBe(false)
    expect(remoteDelete).not.toHaveBeenCalled()
    expect((await repository.getBoard(SHARED)).status).toBe('ok')
  })

  /** A board shared before links had roles: its room has no key to trust. */
  it('says so, and stops, when the room refuses to be destroyed', async () => {
    roomAnswers(409)
    const repository = await boardOnDisk()

    const outcome = await deleteBoardEverywhere(repository, {
      boardId: SHARED,
      shared: true,
      accessKey: KEY,
    })

    expect(outcome).toMatchObject({ ok: false })
    expect((await repository.getBoard(SHARED)).status).toBe('ok')
  })

  /** Already destroyed is not a failure: a second attempt must finish the job. */
  it('carries on when the room is already gone', async () => {
    roomAnswers(410)
    const repository = await boardOnDisk()

    await expect(
      deleteBoardEverywhere(repository, { boardId: SHARED, shared: true, accessKey: KEY }),
    ).resolves.toEqual({ ok: true })
    expect(remoteDelete).toHaveBeenCalled()
  })

  /** A board that was never shared has no room and no row — just a local copy. */
  it('touches no network for a board that is only in this browser', async () => {
    const fetcher = roomAnswers(200)
    const repository = await boardOnDisk(LOCAL)

    const outcome = await deleteBoardEverywhere(repository, {
      boardId: LOCAL,
      shared: false,
      accessKey: null,
    })

    expect(outcome).toEqual({ ok: true })
    expect(fetcher).not.toHaveBeenCalled()
    expect(remoteDelete).not.toHaveBeenCalled()
    expect(await repository.getBoard(LOCAL)).toMatchObject({ status: 'not-found' })
  })
})

describe('leaving a board', () => {
  beforeEach(() => {
    remoteLeave.mockReset()
    remoteLeave.mockResolvedValue(true)
    roomAnswers(200)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /**
   * The distinction the whole pair exists for. Leaving removes YOU; the board
   * carries on for everybody else, and its room is never touched.
   */
  it('never destroys the room', async () => {
    const fetcher = roomAnswers(200)
    const repository = await boardOnDisk()

    await expect(leaveBoard(repository, SHARED)).resolves.toEqual({ ok: true })

    expect(fetcher).not.toHaveBeenCalled()
    expect(remoteLeave).toHaveBeenCalledWith(SHARED)
    expect(await repository.getBoard(SHARED)).toMatchObject({ status: 'not-found' })
  })

  it('reports a refusal rather than pretending', async () => {
    remoteLeave.mockResolvedValue(false)
    const repository = await boardOnDisk()

    expect((await leaveBoard(repository, SHARED)).ok).toBe(false)
    expect((await repository.getBoard(SHARED)).status).toBe('ok')
  })
})

describe('renaming a board from the list', () => {
  beforeEach(() => {
    remoteRename.mockReset()
    remoteRename.mockResolvedValue(true)
  })

  it('writes the name into the document as well as the row', async () => {
    const repository = await boardOnDisk()

    await expect(renameBoard(repository, { boardId: SHARED, shared: true }, 'Pricing')).resolves.toBe(
      true,
    )

    expect(remoteRename).toHaveBeenCalledWith(SHARED, 'Pricing')
    const loaded = await repository.getBoard(SHARED)
    expect(loaded.status).toBe('ok')
    if (loaded.status !== 'ok') return
    // The title in the list is a COPY. The real one lives in the document, and
    // a rename that changed only the row would be undone by opening the board.
    expect(loaded.document.meta.title).toBe('Pricing')
  })

  it('refuses an empty name and one that is too long', async () => {
    const repository = await boardOnDisk()

    await expect(renameBoard(repository, { boardId: SHARED, shared: true }, '   ')).resolves.toBe(
      false,
    )
    await expect(
      renameBoard(repository, { boardId: SHARED, shared: true }, 'x'.repeat(201)),
    ).resolves.toBe(false)
    expect(remoteRename).not.toHaveBeenCalled()
  })

  /**
   * A board we could not fully read is never written back — not even to change
   * its name. Saving a document we failed to parse is the one unacceptable
   * failure, and a rename is not an exception to it.
   */
  it('does not write back a board it could not read', async () => {
    const repository = new MemoryBoardRepository()
    repository.seedRaw(SHARED, {
      format: 'openframe.board',
      schemaVersion: 1,
      savedAt: 0,
      board: { junk: true },
    })

    await renameBoard(repository, { boardId: SHARED, shared: true }, 'Renamed')

    expect((await repository.getBoard(SHARED)).status).toBe('quarantined')
  })
})
