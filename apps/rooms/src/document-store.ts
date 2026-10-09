/**
 * Where a room keeps its board: a snapshot and the changes since, in the
 * Durable Object's storage.
 *
 * Out of `room-object.ts` so it runs in Node: that module imports
 * `cloudflare:workers`, and a guard that only runs once deployed is a guard
 * nobody runs.
 *
 * EVERY VALUE IS SMALLER THAN THE PLATFORM WILL KEEP. The SQLite backend caps a
 * value at 2 MB, and a board used to be written as one: the whole snapshot, or
 * — when a board was published — its whole first update. A board of ten
 * thousand objects is three or four megabytes, so its `put` threw inside a
 * write nobody awaited. Everyone in the room still had the board, which is
 * exactly why nobody noticed; the next cold start had nothing to load.
 */

/** The parts of a Durable Object's storage this uses. */
export interface DocumentStorage {
  readonly get: <T>(key: string) => Promise<T | undefined>
  /** Several keys at once, all or nothing, as the platform's multi-key put is. */
  readonly put: <T>(entries: Record<string, T>) => Promise<void>
  readonly delete: (keys: string[]) => Promise<number>
  readonly list: <T>(options: { prefix: string }) => Promise<Map<string, T>>
}

/**
 * The largest value written: half the platform's 2 MB, so nothing here is ever
 * the value that finds out exactly where the line is.
 */
export const PART_BYTES = 1024 * 1024

/**
 * How many loose updates are allowed before they are merged back into one.
 *
 * Every one of them is read on wake, so the ceiling is really "how much work is
 * a cold start allowed to be". Sixty-four keeps that trivial while making
 * compaction rare.
 */
export const COMPACT_AFTER = 64

/**
 * The snapshot's manifest: how many parts it is in. An earlier version stored
 * the snapshot itself under this key, and that is still read.
 */
const SNAPSHOT = 'snapshot'
/** `s:<n>` — one part of the snapshot, in order. */
const PART_PREFIX = 's:'
/** `u:<seq>` — a change since the last snapshot, newest last. */
const UPDATE_PREFIX = 'u:'
/** One multi-key put or delete takes at most this many keys. */
const KEYS_PER_CALL = 128

interface Manifest {
  readonly parts: number
  readonly bytes: number
}

/*
 * Zero-padded, because keys are replayed in string order: `u:10` sorts before
 * `u:9`, and a board rebuilt out of order is a corrupted one.
 */
const keyOf = (prefix: string, n: number): string => `${prefix}${String(n).padStart(8, '0')}`

const bufferOf = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

export class DocumentStore {
  #sequence = 0

  constructor(
    private readonly storage: DocumentStorage,
    /** The whole document as it is now, for a compaction. */
    private readonly snapshot: () => Uint8Array,
  ) {}

  /** Whether anything has been written: a room that holds a board is not a fresh one. */
  async holdsBoard(): Promise<boolean> {
    if ((await this.storage.get(SNAPSHOT)) !== undefined) return true
    return (await this.storage.list({ prefix: UPDATE_PREFIX })).size > 0
  }

  /** The snapshot's parts and the updates since, in the order they apply. */
  async load(): Promise<Uint8Array[]> {
    const stored = await this.storage.get<ArrayBuffer | Manifest>(SNAPSHOT)
    const updates = await this.storage.list<ArrayBuffer>({ prefix: UPDATE_PREFIX })
    this.#sequence = updates.size

    const out: Uint8Array[] = []
    if (stored instanceof ArrayBuffer) {
      out.push(new Uint8Array(stored))
    } else if (stored !== undefined) {
      const parts = await this.storage.list<ArrayBuffer>({ prefix: PART_PREFIX })
      const whole = new Uint8Array(stored.bytes)
      let at = 0
      for (let n = 0; n < stored.parts; n++) {
        const part = parts.get(keyOf(PART_PREFIX, n))
        if (part === undefined) throw new Error(`Snapshot part ${String(n)} is missing`)
        whole.set(new Uint8Array(part), at)
        at += part.byteLength
      }
      out.push(whole)
    }
    for (const value of updates.values()) out.push(new Uint8Array(value))
    return out
  }

  /**
   * Writes a change before the handler that caused it returns.
   *
   * One too large to be a value is never stored as one: the document already
   * holds it, so the snapshot is written instead, in parts.
   */
  async persist(update: Uint8Array): Promise<void> {
    if (update.byteLength > PART_BYTES) {
      await this.compact()
      return
    }
    await this.storage.put({ [keyOf(UPDATE_PREFIX, this.#sequence++)]: bufferOf(update) })
    if (this.#sequence >= COMPACT_AFTER) await this.compact()
  }

  /** Folds everything into one snapshot, in parts, so a cold start stays cheap. */
  async compact(): Promise<void> {
    const whole = this.snapshot()
    const parts: ArrayBuffer[] = []
    for (let at = 0; at < whole.byteLength || parts.length === 0; at += PART_BYTES) {
      parts.push(bufferOf(whole.subarray(at, at + PART_BYTES)))
    }
    if (parts.length >= KEYS_PER_CALL) {
      throw new Error(`A board of ${String(whole.byteLength)} bytes is more than a room keeps`)
    }

    /*
     * The parts and the manifest that names them in ONE write, so a cold start
     * finds either the old snapshot or the new one — never a manifest pointing
     * at parts half replaced.
     */
    const entries: Record<string, ArrayBuffer | Manifest> = {}
    parts.forEach((part, n) => {
      entries[keyOf(PART_PREFIX, n)] = part
    })
    entries[SNAPSHOT] = { parts: parts.length, bytes: whole.byteLength }
    await this.storage.put(entries)

    // What the new snapshot covers: the loose updates, and parts beyond its end.
    const stale = [
      ...(await this.storage.list({ prefix: UPDATE_PREFIX })).keys(),
      ...[...(await this.storage.list({ prefix: PART_PREFIX })).keys()].filter(
        (key) => Number(key.slice(PART_PREFIX.length)) >= parts.length,
      ),
    ]
    for (let at = 0; at < stale.length; at += KEYS_PER_CALL) {
      await this.storage.delete(stale.slice(at, at + KEYS_PER_CALL))
    }
    this.#sequence = 0
  }
}
