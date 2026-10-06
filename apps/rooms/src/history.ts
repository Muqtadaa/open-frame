import {
  ROOM_RETENTION,
  VERSION_TIMING,
  nextThinningAt,
  versionDueAt,
  versionsToDrop,
  type VersionEntry,
  type VersionKind,
  type VersionTiming,
} from '@openframe/core/history'

/**
 * A shared board's earlier versions (ADR 0019).
 *
 * WHEN a version is taken and WHICH are kept is `@openframe/core/history`,
 * shared with the browser's history of a local board. This is the room's half:
 * where the versions go, what the room remembers about them, and the alarm
 * that wakes it to take one.
 *
 * Kept out of `room-object.ts` behind two narrow interfaces — the storage it
 * needs and the bucket it needs — so it runs in Node against both in memory,
 * for the reason `access.ts` gives: a guard that can only be run by deploying
 * is a guard nobody runs.
 *
 * A version is the room's whole document as Yjs bytes, gzipped. The room does
 * not read it, exactly as it reads no update (ADR 0016): what a version
 * CONTAINS is decided by the client that opens it, through the same check
 * every remote object passes.
 */

/** What the room remembers about one version. The bytes are in the bucket. */
export interface VersionRecord {
  readonly id: string
  readonly at: number
  readonly kind: VersionKind
  readonly name?: string
  /** Size of the stored (compressed) version, for showing. */
  readonly bytes: number
}

interface HistoryState {
  /** When the first change not yet in a version was made. */
  readonly dirtySince: number | null
  readonly lastVersionAt: number | null
  readonly lastThinnedAt: number | null
}

const CLEAN: HistoryState = { dirtySince: null, lastVersionAt: null, lastThinnedAt: null }

/** The room's history state: dirtiness and the last version and thinning. */
export const HISTORY_STATE = 'history'
/** `v:<id>` — one version's record. Ids sort by time, so a listing is in order. */
export const VERSION_PREFIX = 'v:'

/**
 * A version id: the time it was taken, zero-padded so ids sort as times do,
 * and a random tail so two taken in the same millisecond do not collide.
 */
export const VERSION_ID = /^[0-9]{16}-[0-9a-f]{8}$/

export function versionId(at: number, random: () => number = Math.random): string {
  const tail = Math.floor(random() * 0x1_0000_0000)
    .toString(16)
    .padStart(8, '0')
  return `${String(at).padStart(16, '0')}-${tail}`
}

/**
 * Where a version's bytes live: under the board's own prefix, so the sweep that
 * deletes a board's images when it is destroyed takes its history with them.
 * An image id cannot contain a slash (`route.ts`), so no image can be named
 * over a version.
 */
export function versionKey(boardId: string, id: string): string {
  return `${boardId}/versions/${id}`
}

/** The parts of a Durable Object's storage history uses. */
export interface HistoryStorage {
  readonly get: <T>(key: string) => Promise<T | undefined>
  readonly put: <T>(key: string, value: T) => Promise<void>
  readonly delete: (keys: string[]) => Promise<number>
  readonly list: <T>(options: { prefix: string }) => Promise<Map<string, T>>
  readonly getAlarm: () => Promise<number | null>
  readonly setAlarm: (at: number) => Promise<void>
  readonly deleteAlarm: () => Promise<void>
}

/** The parts of an R2 bucket history uses. */
export interface HistoryBucket {
  readonly put: (key: string, value: Uint8Array) => Promise<unknown>
  readonly get: (key: string) => Promise<{ arrayBuffer: () => Promise<ArrayBuffer> } | null>
  readonly delete: (keys: string[]) => Promise<void>
}

export interface RoomHistoryDeps {
  readonly storage: HistoryStorage
  readonly bucket: HistoryBucket
  /** The board this room is, or `null` before any request has said. */
  readonly boardId: () => Promise<string | null>
  /** The whole document, as Yjs bytes. */
  readonly snapshot: () => Uint8Array
  /** Whether the board is being deleted or already has been. */
  readonly going: () => Promise<boolean>
  /** Tracks a bucket write so a destroy can wait for it (`InFlight`). */
  readonly track: <T>(write: Promise<T>) => Promise<T>
  readonly now?: () => number
  readonly timing?: VersionTiming
  readonly random?: () => number
}

/** Durable Object storage takes at most 128 keys in one delete. */
const STORAGE_DELETE_LIMIT = 128
/** R2 takes at most 1000 keys in one delete. */
const BUCKET_DELETE_LIMIT = 1000

export class RoomHistory {
  readonly #deps: RoomHistoryDeps
  readonly #now: () => number
  readonly #timing: VersionTiming
  /**
   * The last edit, in memory only. Lost when the room is evicted — which only
   * happens once it has been idle, so a lost value means "settled", and the
   * state's `dirtySince` stands in for it.
   */
  #lastEditAt: number | null = null
  /** Counts edits, so a version taken while edits arrive knows it missed some. */
  #edits = 0

  constructor(deps: RoomHistoryDeps) {
    this.#deps = deps
    this.#now = deps.now ?? Date.now
    this.#timing = deps.timing ?? VERSION_TIMING
  }

  /**
   * The document changed. Marks the board as having something to keep, and
   * makes sure an alarm will come for it.
   *
   * Cheap on purpose, because it runs on every edit: once the board is dirty
   * and an alarm is set there is nothing to write. The alarm decides whether
   * editing has settled when it fires, rather than every edit moving it.
   */
  async edited(): Promise<void> {
    this.#lastEditAt = this.#now()
    this.#edits++
    const state = await this.#state()
    if (state.dirtySince !== null && (await this.#deps.storage.getAlarm()) !== null) return
    const dirty: HistoryState =
      state.dirtySince === null ? { ...state, dirtySince: this.#lastEditAt } : state
    if (dirty !== state) await this.#deps.storage.put(HISTORY_STATE, dirty)
    await this.#schedule(dirty)
  }

  /**
   * The alarm: take a version if one is due, thin if thinning is, and set the
   * next alarm.
   *
   * A failure to write a version THROWS, so the runtime retries the alarm.
   * Should the retries run out, the next edit finds a dirty board with no
   * alarm and sets one — the board is never left dirty with nothing coming.
   */
  async alarm(): Promise<void> {
    if (await this.#deps.going()) return
    const now = this.#now()
    let state = await this.#state()

    const due = this.#versionDue(state)
    if (due !== null && due <= now) state = await this.#take('auto', now, state)

    /*
     * Whatever retention no longer keeps goes whenever the room is awake
     * anyway, not only at the moment a boundary was due — so a room that
     * slept through one, or kept versions from before thinning existed,
     * catches up on its next wake.
     */
    const records = await this.list()
    const drop = versionsToDrop(records.map(entryOf), now, ROOM_RETENTION)
    const thinAt = nextThinningAt(records, now, state.lastThinnedAt, ROOM_RETENTION)
    if (drop.length > 0 || (thinAt !== null && thinAt <= now)) {
      state = await this.#thin(drop, now, state)
    }

    await this.#schedule(state)
  }

  /** Every version this board has, newest first. */
  async list(): Promise<VersionRecord[]> {
    const records = await this.#deps.storage.list<VersionRecord>({ prefix: VERSION_PREFIX })
    return [...records.values()].sort((a, b) => b.at - a.at)
  }

  /**
   * One version's stored bytes (gzipped Yjs), or `null` for a version this
   * room does not have. The record is the authority, not the bucket: a version
   * thinned out of the record is gone even if its bytes have not been swept.
   */
  async read(id: string): Promise<Uint8Array | null> {
    if (!VERSION_ID.test(id)) return null
    const record = await this.#deps.storage.get<VersionRecord>(VERSION_PREFIX + id)
    if (record === undefined) return null
    const boardId = await this.#deps.boardId()
    if (boardId === null) return null
    const object = await this.#deps.bucket.get(versionKey(boardId, id))
    if (object === null) return null
    return new Uint8Array(await object.arrayBuffer())
  }

  #versionDue(state: HistoryState): number | null {
    return versionDueAt(
      {
        dirtySince: state.dirtySince,
        lastEditAt: this.#lastEditAt,
        lastVersionAt: state.lastVersionAt,
      },
      this.#timing,
    )
  }

  async #state(): Promise<HistoryState> {
    return (await this.#deps.storage.get<HistoryState>(HISTORY_STATE)) ?? CLEAN
  }

  /** Writes the document as a version, and answers the state after it. */
  async #take(kind: VersionKind, at: number, state: HistoryState): Promise<HistoryState> {
    const boardId = await this.#deps.boardId()
    if (boardId === null) return state

    // Read together, synchronously: an edit after this is one the version missed.
    const seen = this.#edits
    const document = this.#deps.snapshot()

    const bytes = await gzip(document)
    const id = versionId(at, this.#deps.random)
    const key = versionKey(boardId, id)
    await this.#deps.track(this.#deps.bucket.put(key, bytes))

    /*
     * R2 lets other requests run while this waits on it, so the board may
     * have started going meanwhile. The destroy drained what it could see;
     * this takes back the one it could not, as an upload does.
     */
    if (await this.#deps.going()) {
      await this.#deps.bucket.delete([key])
      return state
    }

    const record: VersionRecord = { id, at, kind, bytes: bytes.byteLength }
    await this.#deps.storage.put(VERSION_PREFIX + id, record)

    const next: HistoryState = {
      ...state,
      // Edits that arrived while the version was being written are not in it.
      dirtySince: this.#edits === seen ? null : (this.#lastEditAt ?? at),
      lastVersionAt: at,
    }
    await this.#deps.storage.put(HISTORY_STATE, next)
    return next
  }

  /**
   * Drops what retention no longer keeps: bytes first, then the records. A
   * failure part-way leaves records whose bytes may be gone, which `read`
   * answers as a missing version — never bytes with no record, which nothing
   * would ever find to delete.
   */
  async #thin(drop: readonly string[], now: number, state: HistoryState): Promise<HistoryState> {
    const boardId = await this.#deps.boardId()
    if (boardId !== null && drop.length > 0) {
      for (const keys of chunks(
        drop.map((id) => versionKey(boardId, id)),
        BUCKET_DELETE_LIMIT,
      )) {
        await this.#deps.bucket.delete(keys)
      }
      for (const keys of chunks(
        drop.map((id) => VERSION_PREFIX + id),
        STORAGE_DELETE_LIMIT,
      )) {
        await this.#deps.storage.delete(keys)
      }
    }
    const next: HistoryState = { ...state, lastThinnedAt: now }
    await this.#deps.storage.put(HISTORY_STATE, next)
    return next
  }

  /** Sets the alarm for whichever comes first: a version, or thinning. */
  async #schedule(state: HistoryState): Promise<void> {
    const now = this.#now()
    const due = this.#versionDue(state)
    const records = await this.list()
    const thin = nextThinningAt(records, now, state.lastThinnedAt, ROOM_RETENTION)
    const next = earliest(due, thin)
    const current = await this.#deps.storage.getAlarm()
    if (next === null) {
      if (current !== null) await this.#deps.storage.deleteAlarm()
      return
    }
    if (current !== next) await this.#deps.storage.setAlarm(next)
  }
}

function entryOf(record: VersionRecord): VersionEntry {
  return record.name === undefined
    ? { id: record.id, at: record.at, kind: record.kind }
    : { id: record.id, at: record.at, kind: record.kind, name: record.name }
}

function earliest(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return Math.min(a, b)
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Gzips bytes with the platform's own stream, which Workers, browsers and Node all have. */
export async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * The timing from the environment, for the rooms suite, which cannot wait
 * minutes for a version. `"<settle ms>,<interval ms>"`; anything else, or
 * nothing, is the product's own timing. Never set in `wrangler.toml`.
 */
export function timingFrom(value: string | undefined): VersionTiming {
  if (value === undefined) return VERSION_TIMING
  const [settle, interval] = value.split(',').map(Number)
  if (
    settle === undefined ||
    interval === undefined ||
    !Number.isInteger(settle) ||
    !Number.isInteger(interval) ||
    settle < 1 ||
    interval < 1
  ) {
    return VERSION_TIMING
  }
  return { settleMs: settle, intervalMs: interval }
}
