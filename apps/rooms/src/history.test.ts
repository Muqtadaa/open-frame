import { DAY_MS, MAX_INTERVAL_MS, SETTLE_MS } from '@openframe/core/history'
import { describe, expect, it } from 'vitest'

import {
  HISTORY_STATE,
  RoomHistory,
  VERSION_ID,
  VERSION_PREFIX,
  timingFrom,
  versionId,
  versionKey,
  type HistoryBucket,
  type HistoryStorage,
  type VersionRecord,
} from './history.js'

const T0 = Date.UTC(2026, 9, 6, 9, 0, 0)
const BOARD = 'brd_one'

class MemoryStorage implements HistoryStorage {
  readonly values = new Map<string, unknown>()
  alarm: number | null = null

  readonly get = <T>(key: string): Promise<T | undefined> =>
    Promise.resolve(structuredClone(this.values.get(key)) as T | undefined)
  readonly put = <T>(key: string, value: T): Promise<void> => {
    this.values.set(key, structuredClone(value))
    return Promise.resolve()
  }
  readonly delete = (keys: string[]): Promise<number> => {
    if (keys.length > 128) throw new Error('more than 128 keys in one delete')
    let n = 0
    for (const key of keys) if (this.values.delete(key)) n++
    return Promise.resolve(n)
  }
  readonly list = <T>(options: { prefix: string }): Promise<Map<string, T>> => {
    const out = new Map<string, T>()
    for (const key of [...this.values.keys()].sort()) {
      if (key.startsWith(options.prefix)) out.set(key, structuredClone(this.values.get(key)) as T)
    }
    return Promise.resolve(out)
  }
  readonly getAlarm = (): Promise<number | null> => Promise.resolve(this.alarm)
  readonly setAlarm = (at: number): Promise<void> => {
    this.alarm = at
    return Promise.resolve()
  }
  readonly deleteAlarm = (): Promise<void> => {
    this.alarm = null
    return Promise.resolve()
  }
}

class MemoryBucket implements HistoryBucket {
  readonly objects = new Map<string, Uint8Array>()
  failPuts = false

  readonly put = (key: string, value: Uint8Array): Promise<unknown> => {
    if (this.failPuts) return Promise.reject(new Error('R2 is down'))
    this.objects.set(key, value)
    return Promise.resolve(undefined)
  }
  readonly get = (key: string): Promise<{ arrayBuffer: () => Promise<ArrayBuffer> } | null> => {
    const bytes = this.objects.get(key)
    if (bytes === undefined) return Promise.resolve(null)
    return Promise.resolve({
      arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
    })
  }
  readonly delete = (keys: string[]): Promise<void> => {
    for (const key of keys) this.objects.delete(key)
    return Promise.resolve()
  }
}

function setup(
  options: {
    going?: () => boolean
    snapshot?: () => Uint8Array
    boardId?: () => string | null
  } = {},
) {
  const storage = new MemoryStorage()
  const bucket = new MemoryBucket()
  const clock = { now: T0 }
  let seq = 0
  const history = new RoomHistory({
    storage,
    bucket,
    boardId: () => Promise.resolve(options.boardId === undefined ? BOARD : options.boardId()),
    snapshot: options.snapshot ?? (() => new Uint8Array([1, 2, 3, seq++])),
    going: () => Promise.resolve(options.going?.() ?? false),
    track: (write) => write,
    now: () => clock.now,
    random: () => 0.5,
  })
  return { storage, bucket, clock, history }
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

describe('version ids', () => {
  it('sort as the times they were taken', () => {
    const early = versionId(999, () => 0.9)
    const late = versionId(1000, () => 0.1)
    expect(early < late).toBe(true)
    expect(VERSION_ID.test(early)).toBe(true)
    expect(VERSION_ID.test(late)).toBe(true)
  })

  it('live under the board’s prefix, so destroying a board sweeps them', () => {
    expect(versionKey('brd_a', 'x').startsWith('brd_a/')).toBe(true)
  })
})

describe('RoomHistory', () => {
  it('sets an alarm for when editing will have settled', async () => {
    const { history, storage } = setup()
    await history.edited()
    expect(storage.alarm).toBe(T0 + SETTLE_MS)
  })

  it('takes a version once editing has settled, and can read it back', async () => {
    const { history, storage, clock } = setup({ snapshot: () => new Uint8Array([7, 8, 9]) })
    await history.edited()
    clock.now = T0 + SETTLE_MS
    await history.alarm()

    const versions = await history.list()
    expect(versions).toHaveLength(1)
    expect(versions[0]?.kind).toBe('auto')
    expect(versions[0]?.at).toBe(T0 + SETTLE_MS)

    const stored = await history.read(versions[0]?.id ?? '')
    expect(stored).not.toBeNull()
    expect([...(await gunzip(stored ?? new Uint8Array()))]).toEqual([7, 8, 9])
    // Clean again: the next wake is when this version leaves the thirty days.
    expect(storage.alarm).toBe(T0 + SETTLE_MS + 30 * DAY_MS)
  })

  it('waits on while somebody is still editing', async () => {
    const { history, storage, clock } = setup()
    await history.edited()
    clock.now = T0 + SETTLE_MS - 1000
    await history.edited()
    clock.now = T0 + SETTLE_MS
    await history.alarm()
    expect(await history.list()).toHaveLength(0)
    expect(storage.alarm).toBe(T0 + 2 * SETTLE_MS - 1000)
  })

  it('takes one at the interval however long editing goes on', async () => {
    const { history, clock } = setup()
    for (let t = 0; t <= MAX_INTERVAL_MS; t += 30_000) {
      clock.now = T0 + t
      await history.edited()
      await history.alarm()
    }
    const versions = await history.list()
    expect(versions.map((v) => v.at)).toEqual([T0 + MAX_INTERVAL_MS])
  })

  it('takes no version of a board nobody has changed', async () => {
    const { history, clock } = setup()
    clock.now = T0 + DAY_MS
    await history.alarm()
    expect(await history.list()).toHaveLength(0)
  })

  it('stays dirty when an edit lands while the version is being written', async () => {
    const { history, storage, bucket, clock } = setup()
    await history.edited()
    clock.now = T0 + SETTLE_MS
    const put = bucket.put
    Object.assign(bucket, {
      put: async (key: string, value: Uint8Array) => {
        clock.now += 10
        await history.edited()
        return put(key, value)
      },
    })
    await history.alarm()
    const state = storage.values.get(HISTORY_STATE) as { dirtySince: number | null }
    expect(state.dirtySince).toBe(T0 + SETTLE_MS + 10)
    expect(storage.alarm).not.toBeNull()
  })

  it('throws when the bucket refuses, and the next edit sets an alarm again', async () => {
    const { history, storage, bucket, clock } = setup()
    await history.edited()
    clock.now = T0 + SETTLE_MS
    bucket.failPuts = true
    await expect(history.alarm()).rejects.toThrow('R2 is down')
    // The runtime's retries ran out and the alarm is gone.
    storage.alarm = null
    bucket.failPuts = false
    clock.now += 1000
    await history.edited()
    expect(storage.alarm).not.toBeNull()
  })

  it('writes nothing for a board that is going', async () => {
    let going = false
    const { history, bucket, clock } = setup({ going: () => going })
    await history.edited()
    clock.now = T0 + SETTLE_MS
    going = true
    await history.alarm()
    expect(bucket.objects.size).toBe(0)
    expect(await history.list()).toHaveLength(0)
  })

  it('takes back a version written while the board started going', async () => {
    let going = false
    const { history, bucket, clock } = setup({ going: () => going })
    await history.edited()
    clock.now = T0 + SETTLE_MS
    const put = bucket.put
    Object.assign(bucket, {
      put: async (key: string, value: Uint8Array) => {
        await put(key, value)
        going = true
      },
    })
    await history.alarm()
    expect(bucket.objects.size).toBe(0)
    expect(await history.list()).toHaveLength(0)
  })

  it('thins what retention no longer keeps, bytes and records both', async () => {
    const { history, storage, bucket, clock } = setup()
    // Two versions on the same day, forty days ago.
    const day = Math.floor((T0 - 40 * DAY_MS) / DAY_MS) * DAY_MS
    const old: VersionRecord[] = [
      { id: versionId(day + 1000, () => 0), at: day + 1000, kind: 'auto', bytes: 3 },
      { id: versionId(day + 2000, () => 0), at: day + 2000, kind: 'auto', bytes: 3 },
      {
        id: versionId(T0 - 400 * DAY_MS, () => 0),
        at: T0 - 400 * DAY_MS,
        kind: 'named',
        name: 'Kickoff',
        bytes: 3,
      },
    ]
    for (const record of old) {
      await storage.put(VERSION_PREFIX + record.id, record)
      await bucket.put(versionKey(BOARD, record.id), new Uint8Array([1]))
    }
    clock.now = T0
    await history.alarm()

    const left = (await history.list()).map((v) => v.at)
    expect(left).toEqual([day + 2000, T0 - 400 * DAY_MS])
    expect(bucket.objects.has(versionKey(BOARD, old[0]?.id ?? ''))).toBe(false)
    // Next wake: when the day's survivor reaches ninety days.
    expect(storage.alarm).toBe(day + 2000 + 90 * DAY_MS)
  })

  it('thins in batches the storage accepts', async () => {
    const { history, storage, bucket, clock } = setup()
    const start = T0 - 100 * DAY_MS
    for (let i = 0; i < 300; i++) {
      const record: VersionRecord = {
        id: versionId(start + i, () => 0),
        at: start + i,
        kind: 'auto',
        bytes: 1,
      }
      await storage.put(VERSION_PREFIX + record.id, record)
      await bucket.put(versionKey(BOARD, record.id), new Uint8Array([1]))
    }
    clock.now = T0
    await history.alarm()
    expect(await history.list()).toHaveLength(0)
    expect(bucket.objects.size).toBe(0)
  })

  it('sets no version alarm while it cannot say which board it is', async () => {
    // A socket restored from hibernation edits before any request named the
    // board. An alarm due now would fire, file nothing, and come back due.
    let board: string | null = null
    const { history, storage, clock } = setup({ boardId: () => board })
    await history.edited()
    expect(storage.alarm).toBeNull()

    clock.now = T0 + 5000
    board = BOARD
    await history.edited()
    expect(storage.alarm).toBe(T0 + 5000 + SETTLE_MS)
    clock.now = T0 + 5000 + SETTLE_MS
    await history.alarm()
    expect(await history.list()).toHaveLength(1)
  })

  it('reads only versions it has a record of, by a well-formed id', async () => {
    const { history, bucket } = setup()
    const id = versionId(T0, () => 0)
    await bucket.put(versionKey(BOARD, id), new Uint8Array([1]))
    expect(await history.read(id)).toBeNull()
    expect(await history.read('../../other/asset')).toBeNull()
  })
})

describe('timingFrom', () => {
  it('is the product’s timing unless both numbers are given', () => {
    expect(timingFrom(undefined)).toEqual({ settleMs: SETTLE_MS, intervalMs: MAX_INTERVAL_MS })
    expect(timingFrom('nonsense')).toEqual({ settleMs: SETTLE_MS, intervalMs: MAX_INTERVAL_MS })
    expect(timingFrom('0,5')).toEqual({ settleMs: SETTLE_MS, intervalMs: MAX_INTERVAL_MS })
    expect(timingFrom('1500,4000')).toEqual({ settleMs: 1500, intervalMs: 4000 })
  })
})

describe('keeping the board as it is now, before a restore', () => {
  it('takes a version of unversioned changes at once', async () => {
    const { history, clock } = setup()
    await history.edited()
    clock.now = T0 + 1000
    expect(await history.keepNow()).toBe(true)
    expect((await history.list()).map((v) => v.at)).toEqual([T0 + 1000])
  })

  it('takes nothing when the newest version already is the board', async () => {
    const { history } = setup()
    expect(await history.keepNow()).toBe(true)
    expect(await history.list()).toHaveLength(0)
  })

  it('says no for a board that is going', async () => {
    const { history } = setup({ going: () => true })
    await history.edited()
    expect(await history.keepNow()).toBe(false)
  })
})

describe('named versions', () => {
  it('keeps the board as it is now under a name, changed or not', async () => {
    const { history, clock } = setup()
    clock.now = T0 + 1000
    const named = await history.name('Kickoff')
    expect(named).toMatchObject({ kind: 'named', name: 'Kickoff', at: T0 + 1000 })
    expect((await history.list()).map((v) => v.name)).toEqual(['Kickoff'])
  })

  it('is never thinned, however old', async () => {
    const { history, clock } = setup()
    await history.name('Kickoff')
    clock.now = T0 + 400 * DAY_MS
    await history.alarm()
    expect((await history.list()).map((v) => v.name)).toEqual(['Kickoff'])
  })

  it('can be deleted, bytes and record both; an automatic one cannot', async () => {
    const { history, bucket, clock } = setup()
    const named = await history.name('Kickoff')
    await history.edited()
    // The next automatic version comes an interval after the named one.
    clock.now = T0 + MAX_INTERVAL_MS
    await history.alarm()
    const automatic = (await history.list()).find((v) => v.kind === 'auto')

    expect(await history.forget(automatic?.id ?? '')).toBe('automatic')
    expect(await history.forget(named?.id ?? '')).toBe('deleted')
    expect(bucket.objects.has(versionKey(BOARD, named?.id ?? ''))).toBe(false)
    expect((await history.list()).map((v) => v.kind)).toEqual(['auto'])
    expect(await history.forget(named?.id ?? '')).toBe('missing')
  })
})
