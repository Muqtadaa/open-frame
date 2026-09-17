import { asBoardId, type BoardRepository } from '@openframe/core'
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
      objects: [{ type: 'sticky', x: 25, y: 35, data: { text: 'persisted' } }],
    })
    await repository.saveBoard(runtime.store.getDocument())
    runtime.dispose()

    const loaded = await repository.getBoard(BOARD)
    expect(loaded.status).toBe('ok')
    if (loaded.status !== 'ok') return
    const object = [...loaded.document.objects.values()][0]
    expect(object?.data).toEqual({ text: 'persisted' })
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
