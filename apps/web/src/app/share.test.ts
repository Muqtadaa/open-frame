import { asBoardId, richFromPlain } from '@openframe/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MemoryBoardRepository } from '../adapters/memory/memory-board-repository.js'
import { createRuntime } from './composition-root.js'
import { currentIdentity } from './identity.js'
import { shareCurrentBoard, ShareFailed } from './share.js'

/**
 * Sharing MOVES a board.
 *
 * It used to copy, and the argument for that was written down: "sharing should
 * never be the act that takes your own board away from you." That held while a
 * board could belong to nobody. Once every board has an owner and the list has
 * one kind of row, a copy is just two boards with the same name drifting apart
 * — and the one you keep clicking is whichever the list happened to sort first.
 *
 * The order here is the whole safety argument: the shared board is written
 * BEFORE the local one is removed, so a failure anywhere leaves the original
 * exactly where it was.
 */

/*
 * Signed in by default, because sharing takes an account now. The guest case
 * is its own test below rather than the ambient condition of every other one.
 */
const SOMEBODY = {
  userId: 'u1',
  email: 'someone@example.test',
  displayName: 'Someone',
  hue: 0,
  accessToken: 't',
}
vi.mock('./identity.js', () => ({
  ACCOUNTS_ENABLED: true,
  currentIdentity: vi.fn(() => Promise.resolve(SOMEBODY)),
}))
vi.mock('./remote-boards.js', () => ({ recordSharedBoard: vi.fn(() => Promise.resolve(true)) }))

const LOCAL = asBoardId('board_origin')

function claimAnswers(body: unknown, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response)),
  )
}

const KEYS = { editor: 'e'.repeat(32), viewer: 'v'.repeat(32) }

describe('sharing a board', () => {
  beforeEach(() => {
    vi.mocked(currentIdentity).mockResolvedValue(SOMEBODY)
    vi.stubGlobal('location', { origin: 'https://example.test' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function boardWithContent() {
    const repository = new MemoryBoardRepository()
    const runtime = await createRuntime({ boardId: LOCAL, repository, autosaveDelayMs: 0 })
    runtime.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ type: 'sticky', x: 0, y: 0, data: { text: richFromPlain('carried over') } }],
    })
    await runtime.flush()
    return { repository, runtime }
  }

  it('writes the board under its new id', async () => {
    claimAnswers(KEYS)
    const { repository, runtime } = await boardWithContent()

    const shared = await shareCurrentBoard(runtime)

    const loaded = await repository.getBoard(shared.boardId)
    expect(loaded.status).toBe('ok')
    if (loaded.status !== 'ok') return
    expect(loaded.document.objects.size).toBe(1)
  })

  it('leaves no original behind', async () => {
    claimAnswers(KEYS)
    const { repository, runtime } = await boardWithContent()

    await shareCurrentBoard(runtime)

    // The point of the change. Two rows for one board is what this removes.
    expect(await repository.getBoard(LOCAL)).toMatchObject({ status: 'not-found' })
    expect(await repository.listBoards()).toHaveLength(1)
  })

  /**
   * The resurrection hazard, which is what makes the order more than a
   * preference. Autosave subscribes to the command stream and writes the WHOLE
   * document under the runtime's board id — so a single keystroke after the
   * move would put the original straight back, and the list would show the two
   * rows this change exists to prevent.
   */
  it('stops the old board being written back by a later edit', async () => {
    claimAnswers(KEYS)
    const { repository, runtime } = await boardWithContent()

    await shareCurrentBoard(runtime)
    runtime.dispatcher.dispatch({ kind: 'CreateObjects', objects: [{ type: 'sticky', x: 9, y: 9 }] })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(await repository.getBoard(LOCAL)).toMatchObject({ status: 'not-found' })
  })

  /**
   * Written first, removed second — so every failure path keeps the original.
   * A room that cannot be claimed must not be the reason somebody's board
   * stops existing.
   */
  it('keeps the original when the room refuses to be claimed', async () => {
    claimAnswers({}, false)
    const { repository, runtime } = await boardWithContent()

    await expect(shareCurrentBoard(runtime)).rejects.toBeInstanceOf(ShareFailed)

    const loaded = await repository.getBoard(LOCAL)
    expect(loaded.status).toBe('ok')
    if (loaded.status !== 'ok') return
    expect(loaded.document.objects.size).toBe(1)

    runtime.dispose()
  })

  it('keeps the original when the room sends something unreadable', async () => {
    claimAnswers({ editor: 42 })
    const { repository, runtime } = await boardWithContent()

    await expect(shareCurrentBoard(runtime)).rejects.toBeInstanceOf(ShareFailed)
    expect((await repository.getBoard(LOCAL)).status).toBe('ok')

    runtime.dispose()
  })

  /**
   * A guest sharing a board produced one nobody owned: no row to list it from,
   * no way to rename or delete it, and a local cache the board list could not
   * tell apart from the cache of somebody else's link. Refused before the room
   * is touched, so nothing is claimed and the original is untouched.
   */
  it('refuses a guest, without claiming a room', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    vi.mocked(currentIdentity).mockResolvedValue(null)
    const { repository, runtime } = await boardWithContent()

    await expect(shareCurrentBoard(runtime)).rejects.toBeInstanceOf(ShareFailed)

    expect(fetcher).not.toHaveBeenCalled()
    expect((await repository.getBoard(LOCAL)).status).toBe('ok')

    runtime.dispose()
  })

  it('hands back both links, each carrying its own key', async () => {
    claimAnswers(KEYS)
    const { runtime } = await boardWithContent()

    const shared = await shareCurrentBoard(runtime)

    expect(shared.editLink).toBe(
      `https://example.test/?room=${shared.boardId}&k=${'e'.repeat(32)}`,
    )
    expect(shared.viewLink).toBe(
      `https://example.test/?room=${shared.boardId}&k=${'v'.repeat(32)}`,
    )
  })
})
