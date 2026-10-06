import {
  asBoardId,
  createEmptyDocument,
  deserializeBoard,
  createDefaultRegistry,
  type BoardDocument,
  type BoardId,
} from '@openframe/core'
import {
  DAY_MS,
  MAX_INTERVAL_MS,
  SETTLE_MS,
  versionId,
  type VersionEntry,
} from '@openframe/core/history'
import { describe, expect, it } from 'vitest'

import type { LocalVersion, LocalVersionStore } from '../runtime/local-versions.js'
import { keepLocalHistory } from './local-history.js'

const T0 = Date.UTC(2026, 9, 6, 9, 0, 0)
const BOARD = asBoardId('board_local')

class MemoryVersions implements LocalVersionStore {
  readonly rows: LocalVersion[] = []

  readonly entries = (): Promise<ReadonlyMap<BoardId, readonly VersionEntry[]>> => {
    const byBoard = new Map<BoardId, VersionEntry[]>()
    for (const row of this.rows) {
      const list = byBoard.get(row.boardId) ?? []
      list.push({ id: row.id, at: row.at, kind: row.kind })
      byBoard.set(row.boardId, list)
    }
    return Promise.resolve(byBoard)
  }
  readonly read = (boardId: BoardId, id: string): Promise<LocalVersion | null> =>
    Promise.resolve(this.rows.find((r) => r.boardId === boardId && r.id === id) ?? null)
  readonly put = (version: LocalVersion): Promise<void> => {
    this.rows.push(version)
    return Promise.resolve()
  }
  readonly drop = (boardId: BoardId, versions: readonly VersionEntry[]): Promise<void> => {
    const ids = new Set(versions.map((v) => v.id))
    for (let i = this.rows.length - 1; i >= 0; i--) {
      const row = this.rows[i]
      if (row?.boardId === boardId && ids.has(row.id)) this.rows.splice(i, 1)
    }
    return Promise.resolve()
  }
  readonly forget = (boardId: BoardId): Promise<void> =>
    this.drop(
      boardId,
      this.rows.filter((r) => r.boardId === boardId),
    )
}

/** Timers that run only when the test moves the clock. */
function setup(versions = new MemoryVersions()) {
  const clock = { now: T0 }
  const timers: { at: number; run: () => void; live: boolean }[] = []
  const listeners = new Set<() => void>()
  let document: BoardDocument = createEmptyDocument(BOARD, 'Plans', T0)
  const history = keepLocalHistory({
    boardId: BOARD,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    document: () => document,
    versions,
    now: () => clock.now,
    schedule: (ms, run) => {
      const timer = { at: clock.now + ms, run, live: true }
      timers.push(timer)
      return () => {
        timer.live = false
      }
    },
    random: () => 0.5,
  })
  const edit = (title?: string): void => {
    if (title !== undefined) document = { ...document, meta: { ...document.meta, title } }
    for (const listener of listeners) listener()
  }
  /** Moves the clock, running each timer that comes due on the way. */
  const advance = async (to: number): Promise<void> => {
    for (;;) {
      const next = timers.filter((t) => t.live && t.at <= to).sort((a, b) => a.at - b.at)[0]
      if (next === undefined) break
      next.live = false
      clock.now = next.at
      next.run()
      await history.idle()
    }
    clock.now = to
    await history.idle()
  }
  /** Moves the clock and fires due timers WITHOUT waiting for the work they queue. */
  const tick = (to: number): void => {
    for (;;) {
      const next = timers.filter((t) => t.live && t.at <= to).sort((a, b) => a.at - b.at)[0]
      if (next === undefined) break
      next.live = false
      clock.now = next.at
      next.run()
    }
    clock.now = to
  }
  return { history, versions, clock, edit, advance, tick, live: () => timers.some((t) => t.live) }
}

describe('a local board’s history', () => {
  it('keeps a version once editing settles, as the board was', async () => {
    const { history, versions, edit, advance } = setup()
    await history.idle()
    edit('Plans, revised')
    await advance(T0 + SETTLE_MS)

    expect(versions.rows).toHaveLength(1)
    const [version] = versions.rows
    expect(version?.kind).toBe('auto')
    expect(version?.title).toBe('Plans, revised')
    // Opened as any stored board is.
    const opened = deserializeBoard(version?.payload, createDefaultRegistry())
    expect(opened.status).toBe('ok')
  })

  it('waits while somebody keeps editing, up to the interval', async () => {
    const { history, versions, edit, advance } = setup()
    await history.idle()
    for (let t = 0; t <= MAX_INTERVAL_MS; t += 30_000) {
      await advance(T0 + t)
      edit()
    }
    expect(versions.rows.map((v) => v.at)).toEqual([T0 + MAX_INTERVAL_MS])
  })

  it('takes nothing when nothing changed', async () => {
    const { history, versions, advance, live } = setup()
    await history.idle()
    await advance(T0 + DAY_MS)
    expect(versions.rows).toHaveLength(0)
    expect(live()).toBe(false)
  })

  it('counts the interval from a version taken in an earlier session', async () => {
    const versions = new MemoryVersions()
    await versions.put({
      boardId: BOARD,
      id: versionId(T0 - 60_000),
      at: T0 - 60_000,
      kind: 'auto',
      title: 'Plans',
      payload: null,
    })
    const { history, edit, advance } = setup(versions)
    await history.idle()
    edit()
    await advance(T0 + SETTLE_MS)
    expect(versions.rows).toHaveLength(1)
    await advance(T0 - 60_000 + MAX_INTERVAL_MS)
    expect(versions.rows).toHaveLength(2)
  })

  it('lets every board’s old versions go, including boards never opened again', async () => {
    const versions = new MemoryVersions()
    const gone = asBoardId('board_deleted_elsewhere')
    for (const [boardId, at] of [
      [gone, T0 - 15 * DAY_MS],
      [BOARD, T0 - 15 * DAY_MS],
      [BOARD, T0 - DAY_MS],
    ] as const) {
      await versions.put({ boardId, id: versionId(at), at, kind: 'auto', title: '', payload: null })
    }
    await versions.put({
      boardId: gone,
      id: versionId(T0 - 60 * DAY_MS),
      at: T0 - 60 * DAY_MS,
      kind: 'named',
      name: 'Kept',
      title: '',
      payload: null,
    })
    const { history } = setup(versions)
    await history.idle()
    expect(versions.rows.map((v) => [v.boardId, v.at])).toEqual([
      [BOARD, T0 - DAY_MS],
      [gone, T0 - 60 * DAY_MS],
    ])
  })

  it('never takes a second version straight after one written while an edit arrived', async () => {
    const versions = new MemoryVersions()
    const put = versions.put
    let release: () => void = () => undefined
    let held = true
    Object.assign(versions, {
      put: async (version: LocalVersion) => {
        if (held) {
          held = false
          await new Promise<void>((resolve) => {
            release = resolve
          })
        }
        return put(version)
      },
    })
    const { history, edit, advance, tick } = setup(versions)
    await history.idle()
    edit()
    // The first version comes due, and its write is held open.
    tick(T0 + SETTLE_MS)
    await Promise.resolve()
    // An edit while it is being written arms a timer on the stale state, and
    // that timer fires and queues a second take behind the first…
    edit()
    tick(T0 + 2 * SETTLE_MS + 1)
    release()
    await history.idle()
    // …which must not produce a second version until the interval allows.
    expect(versions.rows).toHaveLength(1)
    await advance(T0 + SETTLE_MS + MAX_INTERVAL_MS)
    expect(versions.rows).toHaveLength(2)
  })

  it('keeps the board as it is at once when asked, and not twice for no change', async () => {
    const { history, versions, edit } = setup()
    await history.idle()
    edit('Before the restore')
    expect(await history.keepNow()).toBe(true)
    expect(versions.rows.map((v) => v.title)).toEqual(['Before the restore'])
    // Nothing changed since that version, so nothing more is kept.
    expect(await history.keepNow()).toBe(true)
    expect(versions.rows).toHaveLength(1)
  })

  /*
   * A board reopened after its tab closed between an edit and the version it
   * was due: the edit is autosaved but in no version, and this session has no
   * way to know. A restore must not replace it unkept (Codex, on #83).
   */
  it('keeps the board before a restore on a board just reopened, edited or not', async () => {
    const versions = new MemoryVersions()
    await versions.put({
      boardId: BOARD,
      id: versionId(T0 - 60_000),
      at: T0 - 60_000,
      kind: 'auto',
      title: 'Older',
      payload: null,
    })
    const { history } = setup(versions)
    await history.idle()
    expect(await history.keepNow()).toBe(true)
    expect(versions.rows.map((v) => v.title)).toEqual(['Older', 'Plans'])
  })

  it('keeps a named version whether or not anything changed, and it outlives thinning', async () => {
    const versions = new MemoryVersions()
    await versions.put({
      boardId: BOARD,
      id: versionId(T0 - 60_000),
      at: T0 - 60_000,
      kind: 'auto',
      title: 'Older',
      payload: null,
    })
    const { history, advance, edit } = setup(versions)
    await history.idle()
    expect(await history.keepNamed('  Kickoff  ')).toBe(true)
    // Nothing had changed: naming a moment is the point.
    expect(versions.rows.map((v) => [v.kind, v.name])).toEqual([
      ['auto', undefined],
      ['named', 'Kickoff'],
    ])
    // A name the rule refuses is refused here, before anything is written.
    expect(await history.keepNamed('   ')).toBe(false)
    expect(versions.rows).toHaveLength(2)

    // Long after the browser's fourteen days, an edit's version thins the rest.
    await advance(T0 + 20 * DAY_MS)
    edit()
    await advance(T0 + 21 * DAY_MS)
    expect(versions.rows.map((v) => v.kind)).toEqual(['named', 'auto'])
  })

  it('keeps no named version once disposed, even one asked for before', async () => {
    const { history, versions } = setup()
    // Queued behind the opening thinning, then disposed before its turn.
    const kept = history.keepNamed('Too late')
    history.dispose()
    expect(await kept).toBe(false)
    await history.idle()
    expect(versions.rows).toHaveLength(0)
  })

  it('stops for good once disposed', async () => {
    const { history, versions, edit, advance } = setup()
    await history.idle()
    edit()
    history.dispose()
    edit()
    await advance(T0 + DAY_MS)
    expect(versions.rows).toHaveLength(0)
  })
})
