import { asBoardId, richFromPlain, type BoardRepository } from '@openframe/core'
import { beforeEach, describe, expect, it } from 'vitest'

import { createRuntime, type OpenFrameRuntime } from '../app/composition-root.js'
import { IndexedDbBoardRepository } from './indexeddb/indexeddb-board-repository.js'
import { MemoryBoardRepository } from './memory/memory-board-repository.js'

const BOARD = asBoardId('board_test')

/**
 * The same suite runs against BOTH implementations of `BoardRepository`.
 *
 * That is the point of the port: if a behaviour holds for the in-memory adapter
 * and the IndexedDB adapter, a future Postgres adapter has an executable
 * specification to satisfy rather than a prose description to interpret.
 */
describe.each([
  ['MemoryBoardRepository', () => new MemoryBoardRepository()],
  ['IndexedDbBoardRepository', () => new IndexedDbBoardRepository()],
])('%s', (_name, make) => {
  let repository: BoardRepository

  beforeEach(() => {
    repository = make()
  })

  it('reports a board that was never saved as not found', async () => {
    const result = await repository.getBoard(asBoardId(`missing_${String(Math.random())}`))
    expect(result.status).toBe('not-found')
  })

  it('round-trips a board through save and load', async () => {
    const runtime = await createRuntime({ boardId: BOARD, repository, autosaveDelayMs: 0 })
    runtime.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ type: 'sticky', x: 25, y: 35, data: { text: richFromPlain('persisted') } }],
    })
    await repository.saveBoard(runtime.store.getDocument())
    runtime.dispose()

    const loaded = await repository.getBoard(BOARD)
    expect(loaded.status).toBe('ok')
    if (loaded.status !== 'ok') return
    const object = [...loaded.document.objects.values()][0]
    expect(object?.data).toEqual({ text: richFromPlain('persisted') })
    expect(object?.frame.x).toBe(25)
  })

  it('applies patches to a stored board', async () => {
    const runtime = await createRuntime({ boardId: BOARD, repository, autosaveDelayMs: 0 })
    const created = runtime.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ type: 'sticky', x: 0, y: 0 }],
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    await repository.saveBoard(runtime.store.getDocument())
    runtime.dispose()

    const id = created.affected[0]
    if (id === undefined) throw new Error('expected an id')
    await repository.applyPatches(BOARD, [{ op: 'set', id, path: ['frame', 'x'], value: 512 }])

    const loaded = await repository.getBoard(BOARD)
    if (loaded.status !== 'ok') return
    expect(loaded.document.objects.get(id)?.frame.x).toBe(512)
  })

  it('lists and deletes boards', async () => {
    const runtime = await createRuntime({ boardId: BOARD, repository, autosaveDelayMs: 0 })
    await repository.saveBoard(runtime.store.getDocument())
    runtime.dispose()

    expect((await repository.listBoards()).some((b) => b.id === BOARD)).toBe(true)
    await repository.deleteBoard(BOARD)
    expect((await repository.listBoards()).some((b) => b.id === BOARD)).toBe(false)
  })
})

describe('runtime composition', () => {
  let runtime: OpenFrameRuntime | undefined

  beforeEach(() => {
    runtime?.dispose()
    runtime = undefined
  })

  it('starts with an empty board when none is stored', async () => {
    runtime = await createRuntime({ repository: new MemoryBoardRepository(), autosaveDelayMs: 0 })
    expect(runtime.store.getDocument().objects.size).toBe(0)
    expect(runtime.readOnly).toBe(false)
    expect(runtime.notices).toEqual([])
  })

  it('autosaves after a command', async () => {
    const repository = new MemoryBoardRepository()
    runtime = await createRuntime({ boardId: BOARD, repository, autosaveDelayMs: 0 })
    runtime.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ type: 'sticky', x: 0, y: 0 }],
    })

    await new Promise((resolve) => setTimeout(resolve, 10))

    const loaded = await repository.getBoard(BOARD)
    expect(loaded.status).toBe('ok')
    if (loaded.status !== 'ok') return
    expect(loaded.document.objects.size).toBe(1)
  })

  /**
   * THE CARDINAL PERSISTENCE RULE, as an executable test.
   *
   * A board that could not be read opens read-only and autosave is never
   * attached. Writing a partial document over one we failed to parse would
   * destroy the user's work permanently — the one failure mode this system must
   * never have.
   */
  it('opens an unreadable board read-only and never writes back', async () => {
    const repository = new MemoryBoardRepository()
    const corrupt = {
      format: 'openframe.board',
      schemaVersion: 1,
      savedAt: 0,
      board: { junk: true },
    }
    repository.seedRaw(BOARD, corrupt)

    runtime = await createRuntime({ boardId: BOARD, repository, autosaveDelayMs: 0 })
    expect(runtime.readOnly).toBe(true)
    expect(runtime.notices.length).toBeGreaterThan(0)

    runtime.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ type: 'sticky', x: 0, y: 0 }],
    })
    await new Promise((resolve) => setTimeout(resolve, 20))

    const stillThere = await repository.getBoard(BOARD)
    expect(stillThere.status).toBe('quarantined')
  })

  it('warns when a board contains objects this build cannot read', async () => {
    const repository = new MemoryBoardRepository()
    repository.seedRaw(BOARD, {
      format: 'openframe.board',
      schemaVersion: 1,
      savedAt: 0,
      board: {
        id: BOARD,
        meta: { title: 'Board', createdAt: 0 },
        objects: [
          {
            id: 'obj_future',
            type: 'evidence',
            dataVersion: 1,
            frame: { x: 0, y: 0, width: 10, height: 10, rotation: 0 },
            parentId: null,
            order: 'a0',
            style: {},
            locked: false,
            hidden: false,
            data: { text: 'from the future' },
            meta: { createdAt: 0, createdBy: null, createdVia: 'user' },
          },
        ],
        assets: [],
      },
    })

    runtime = await createRuntime({ boardId: BOARD, repository, autosaveDelayMs: 0 })
    expect(runtime.readOnly).toBe(false)
    expect(runtime.notices.join(' ')).toContain('placeholders')
  })
})

/**
 * Leaving a board must not cost the last thing done to it.
 *
 * Autosave coalesces a burst of commands into one write, which means there is
 * always a window — 500ms in the shipped build — where the document on screen
 * is ahead of the document on disk. Nothing closed that window: `dispose`
 * CLEARS the pending timer, a reload never ran it, and until there was a way
 * back to the dashboard the only way to hit it was to close the tab within
 * half a second of typing.
 *
 * Rule 7 is about not writing a document you could not read. This is its other
 * half: having read one, write what the user did to it.
 */
describe('leaving a board', () => {
  it('writes a pending change instead of dropping it', async () => {
    const repository = new MemoryBoardRepository()
    // The real delay, not zero: at zero there is no window and the test
    // passes whether or not anything flushes.
    const runtime = await createRuntime({ boardId: BOARD, repository, autosaveDelayMs: 500 })

    runtime.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ type: 'sticky', x: 0, y: 0, data: { text: richFromPlain('unsaved') } }],
    })

    await runtime.flush()

    const loaded = await repository.getBoard(BOARD)
    expect(loaded.status).toBe('ok')
    if (loaded.status !== 'ok') return
    expect(loaded.document.objects.size).toBe(1)

    runtime.dispose()
  })

  /**
   * The window is real, and this is what proves the test above is not passing
   * on a zero-delay coincidence: the same sequence WITHOUT the flush leaves
   * disk empty.
   */
  it('has a window to lose work in, which is why the flush exists', async () => {
    const repository = new MemoryBoardRepository()
    const runtime = await createRuntime({ boardId: BOARD, repository, autosaveDelayMs: 500 })

    runtime.dispatcher.dispatch({ kind: 'CreateObjects', objects: [{ type: 'sticky', x: 0, y: 0 }] })

    expect(await repository.getBoard(BOARD)).toMatchObject({ status: 'not-found' })

    runtime.dispose()
  })

  /** A quarantined board is never written back — not even by an explicit flush. */
  it('refuses to flush a board that could not be read', async () => {
    const repository = new MemoryBoardRepository()
    repository.seedRaw(BOARD, {
      format: 'openframe.board',
      schemaVersion: 1,
      savedAt: 0,
      board: { junk: true },
    })

    const runtime = await createRuntime({ boardId: BOARD, repository, autosaveDelayMs: 500 })
    expect(runtime.readOnly).toBe(true)

    await runtime.flush()

    // Still the corrupt original, not an empty board written over it.
    const loaded = await repository.getBoard(BOARD)
    expect(loaded.status).toBe('quarantined')

    runtime.dispose()
  })
})

/**
 * The board says whether it is saved (C3 #3). A local-first board saves on
 * its own, half a second behind what is on screen, and a failed write only
 * ever reached the console — so the one fact that would reassure somebody
 * returning to their work, and the one that should alarm them, were both
 * invisible.
 */
describe('the save state', () => {
  class FailingRepository extends MemoryBoardRepository {
    override saveBoard(): Promise<void> {
      return Promise.reject(new Error('disk full'))
    }
  }

  it('reads saved, then pending while a change waits, then saved again', async () => {
    const repository = new MemoryBoardRepository()
    const runtime = await createRuntime({ boardId: BOARD, repository, autosaveDelayMs: 500 })
    expect(runtime.saveStatus.get()).toBe('saved')

    const seen: string[] = []
    const stop = runtime.saveStatus.subscribe(() => seen.push(runtime.saveStatus.get()))
    runtime.dispatcher.dispatch({ kind: 'CreateObjects', objects: [{ type: 'sticky', x: 0, y: 0 }] })
    expect(runtime.saveStatus.get()).toBe('pending')

    await runtime.flush()
    expect(runtime.saveStatus.get()).toBe('saved')
    expect(seen).toEqual(['pending', 'saving', 'saved'])
    stop()
    runtime.dispose()
  })

  it('says so when a save fails, rather than only telling the console', async () => {
    const runtime = await createRuntime({
      boardId: BOARD,
      repository: new FailingRepository(),
      autosaveDelayMs: 500,
    })
    runtime.dispatcher.dispatch({ kind: 'CreateObjects', objects: [{ type: 'sticky', x: 0, y: 0 }] })
    await runtime.flush()
    expect(runtime.saveStatus.get()).toBe('failed')
    runtime.dispose()
  })

  /*
   * Two writes can be in flight at once: a slow disk, and an edit made after
   * the debounce. Whichever FINISHES last used to set the state, so an older
   * write landing after a newer one failed reported "Saved" — assuring
   * somebody that a change was on disk when the write carrying it had failed.
   */
  it('lets only the latest write decide, whatever order they finish in', async () => {
    const pending: { resolve: () => void; reject: (error: Error) => void }[] = []
    class SlowRepository extends MemoryBoardRepository {
      override saveBoard(): Promise<void> {
        return new Promise((resolve, reject) => {
          pending.push({ resolve: () => resolve(), reject })
        })
      }
    }
    const runtime = await createRuntime({
      boardId: BOARD,
      repository: new SlowRepository(),
      autosaveDelayMs: 0,
    })
    const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5))

    runtime.dispatcher.dispatch({ kind: 'CreateObjects', objects: [{ type: 'sticky', x: 0, y: 0 }] })
    await tick()
    runtime.dispatcher.dispatch({ kind: 'CreateObjects', objects: [{ type: 'sticky', x: 9, y: 9 }] })
    await tick()
    expect(pending).toHaveLength(2)

    // The newer write fails, then the older one lands.
    pending[1]?.reject(new Error('disk full'))
    await tick()
    pending[0]?.resolve()
    await tick()
    expect(runtime.saveStatus.get()).toBe('failed')
    runtime.dispose()
  })

  it('reads read-only on a board that is never written back', async () => {
    const repository = new MemoryBoardRepository()
    repository.seedRaw(BOARD, { format: 'openframe.board', schemaVersion: 1, savedAt: 0, board: { junk: true } })
    const runtime = await createRuntime({ boardId: BOARD, repository, autosaveDelayMs: 500 })
    expect(runtime.saveStatus.get()).toBe('read-only')
    runtime.dispose()
  })
})
