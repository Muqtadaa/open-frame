import { asBoardId, richFromPlain, type BoardId, type BoardRepository } from '@openframe/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { forgetCrdt } from '../adapters/indexeddb/crdt-store.js'
import { MemoryBoardRepository } from '../adapters/memory/memory-board-repository.js'
import * as lifecycle from './board-lifecycle.js'
import { createRuntime } from './composition-root.js'
import { fakeRemoteBoards, fakeRooms } from './services.fake.js'

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

let rooms = fakeRooms()
let remote = fakeRemoteBoards()
const roomRename = vi.fn<lifecycle.LifecycleDeps['renameInRoom']>()

beforeEach(() => {
  rooms = fakeRooms()
  remote = fakeRemoteBoards()
  roomRename.mockReset()
  roomRename.mockResolvedValue(true)
})

const deps = (repository: BoardRepository): lifecycle.LifecycleDeps => ({
  repository,
  rooms,
  remoteBoards: remote,
  forgetCrdt,
  renameInRoom: roomRename,
})

// The use cases as they read at a call site, with this test's fakes behind them.
const deleteBoardEverywhere = (
  repository: BoardRepository,
  board: Parameters<typeof lifecycle.deleteBoardEverywhere>[1],
) => lifecycle.deleteBoardEverywhere(deps(repository), board)
const leaveBoard = (repository: BoardRepository, boardId: BoardId) =>
  lifecycle.leaveBoard(deps(repository), boardId)
const renameBoard = (
  repository: BoardRepository,
  board: Parameters<typeof lifecycle.renameBoard>[1],
  title: string,
) => lifecycle.renameBoard(deps(repository), board, title)

const SHARED = asBoardId('brd_abcdefgh12345678')
const LOCAL = asBoardId('board_alone')
const KEY = 'e'.repeat(32)

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
  it('destroys the room, the row and the local copy', async () => {
    const repository = await boardOnDisk()

    const outcome = await deleteBoardEverywhere(repository, {
      boardId: SHARED,
      shared: true,
      accessKey: KEY,
    })

    expect(outcome).toEqual({ ok: true })
    // With the key the row holds. That it travels in the request BODY rather
    // than the URL is the room client's to keep (room-client.test.ts).
    expect(rooms.destroy).toHaveBeenCalledWith(SHARED, KEY)
    expect(remote.remove).toHaveBeenCalledWith(SHARED)
    expect(await repository.getBoard(SHARED)).toMatchObject({ status: 'not-found' })
  })

  /**
   * THE ORDER, as an executable statement. A room that cannot be reached must
   * leave the row and the local copy exactly where they are, so the person can
   * try again rather than be left with a board they can neither see nor reach.
   */
  it('keeps the row and the local copy when the room cannot be reached', async () => {
    rooms.destroy.mockResolvedValue('unreachable')
    const repository = await boardOnDisk()

    const outcome = await deleteBoardEverywhere(repository, {
      boardId: SHARED,
      shared: true,
      accessKey: KEY,
    })

    expect(outcome.ok).toBe(false)
    expect(remote.remove).not.toHaveBeenCalled()
    expect((await repository.getBoard(SHARED)).status).toBe('ok')
  })

  /** A board shared before links had roles: its room has no key to trust. */
  it('says so, and stops, when the room refuses to be destroyed', async () => {
    rooms.destroy.mockResolvedValue('legacy')
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
    rooms.destroy.mockResolvedValue('gone')
    const repository = await boardOnDisk()

    await expect(
      deleteBoardEverywhere(repository, { boardId: SHARED, shared: true, accessKey: KEY }),
    ).resolves.toEqual({ ok: true })
    expect(remote.remove).toHaveBeenCalled()
  })

  /** A board that was never shared has no room and no row — just a local copy. */
  it('touches no network for a board that is only in this browser', async () => {
    const repository = await boardOnDisk(LOCAL)

    const outcome = await deleteBoardEverywhere(repository, {
      boardId: LOCAL,
      shared: false,
      accessKey: null,
    })

    expect(outcome).toEqual({ ok: true })
    expect(rooms.destroy).not.toHaveBeenCalled()
    expect(remote.remove).not.toHaveBeenCalled()
    expect(await repository.getBoard(LOCAL)).toMatchObject({ status: 'not-found' })
  })
})

describe('leaving a board', () => {
  /**
   * The distinction the whole pair exists for. Leaving removes YOU; the board
   * carries on for everybody else, and its room is never touched.
   */
  it('never destroys the room', async () => {
    const repository = await boardOnDisk()

    await expect(leaveBoard(repository, SHARED)).resolves.toEqual({ ok: true })

    expect(rooms.destroy).not.toHaveBeenCalled()
    expect(remote.leave).toHaveBeenCalledWith(SHARED)
    expect(await repository.getBoard(SHARED)).toMatchObject({ status: 'not-found' })
  })

  it('reports a refusal rather than pretending', async () => {
    remote.leave.mockResolvedValue(false)
    const repository = await boardOnDisk()

    expect((await leaveBoard(repository, SHARED)).ok).toBe(false)
    expect((await repository.getBoard(SHARED)).status).toBe('ok')
  })
})

describe('renaming a board from the list', () => {
  beforeEach(() => {
    remote.rename.mockReset()
    remote.rename.mockResolvedValue(true)
    roomRename.mockReset()
    roomRename.mockResolvedValue(true)
  })

  /*
   * The name a shared board shows is the one in its ROOM. Renamed only in the
   * list and this browser's copy, the board went on opening under its old
   * name everywhere else while the list showed the new one (reported by the
   * owner).
   */
  it('renames a shared board in its room, with the key the row holds', async () => {
    const repository = await boardOnDisk()
    await expect(
      renameBoard(repository, { boardId: SHARED, shared: true, accessKey: KEY }, 'Pricing'),
    ).resolves.toBe(true)
    expect(roomRename).toHaveBeenCalledWith(SHARED, KEY, 'Pricing')
  })

  /*
   * The row is the one that says no — the database lets only the owner rename
   * — so it goes first. Renamed in the room first, a refused row left the
   * board renamed for everyone while the list and the row said otherwise
   * (Codex, on #17).
   */
  it('touches the room only once the row has taken the name', async () => {
    const repository = await boardOnDisk()
    remote.rename.mockResolvedValue(false)

    await expect(
      renameBoard(
        repository,
        { boardId: SHARED, shared: true, accessKey: KEY, title: 'Old' },
        'Pricing',
      ),
    ).resolves.toBe(false)
    expect(roomRename).not.toHaveBeenCalled()
  })

  it('puts the row back when the room cannot take the name', async () => {
    const repository = await boardOnDisk()
    roomRename.mockResolvedValue(false)

    await expect(
      renameBoard(
        repository,
        { boardId: SHARED, shared: true, accessKey: KEY, title: 'Old' },
        'Pricing',
      ),
    ).resolves.toBe(false)
    expect(remote.rename.mock.calls).toEqual([
      [SHARED, 'Pricing'],
      [SHARED, 'Old'],
    ])
  })

  it('renames nothing when the room cannot be reached, and says so', async () => {
    const repository = await boardOnDisk()
    roomRename.mockResolvedValue(false)

    await expect(
      renameBoard(repository, { boardId: SHARED, shared: true, accessKey: KEY }, 'Pricing'),
    ).resolves.toBe(false)
    const loaded = await repository.getBoard(SHARED)
    expect(loaded.status === 'ok' && loaded.document.meta.title).not.toBe('Pricing')
  })

  it('writes the name into the document as well as the row', async () => {
    const repository = await boardOnDisk()

    await expect(
      renameBoard(repository, { boardId: SHARED, shared: true }, 'Pricing'),
    ).resolves.toBe(true)

    expect(remote.rename).toHaveBeenCalledWith(SHARED, 'Pricing')
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
    expect(remote.rename).not.toHaveBeenCalled()
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
