/**
 * A Durable Object's storage, in memory, for tests that run in Node.
 *
 * Holds the platform's limits that have bitten: 128 keys to one delete or one
 * multi-key put, and — when asked — the largest value the SQLite backend will
 * keep (2 MB). Without that cap a test could store a whole board as one value
 * and pass, against storage that would have refused it.
 */
export class MemoryStorage {
  readonly values = new Map<string, unknown>()
  alarm: number | null = null

  constructor(private readonly options: { readonly maxValueBytes?: number } = {}) {}

  readonly get = <T>(key: string): Promise<T | undefined> =>
    Promise.resolve(structuredClone(this.values.get(key)) as T | undefined)

  readonly put = <T>(keyOrEntries: string | Record<string, T>, value?: T): Promise<void> => {
    const entries: [string, unknown][] =
      typeof keyOrEntries === 'string' ? [[keyOrEntries, value]] : Object.entries(keyOrEntries)
    if (entries.length > 128) return Promise.reject(new Error('more than 128 keys in one put'))
    for (const [key, entry] of entries) {
      const bytes = entry instanceof ArrayBuffer || ArrayBuffer.isView(entry) ? entry.byteLength : 0
      const max = this.options.maxValueBytes
      if (max !== undefined && bytes > max) {
        return Promise.reject(new Error(`value for ${key} is ${String(bytes)} bytes`))
      }
    }
    // All or nothing, as the platform's multi-key put is.
    for (const [key, entry] of entries) this.values.set(key, structuredClone(entry))
    return Promise.resolve()
  }

  readonly delete = (keys: string[]): Promise<number> => {
    if (keys.length > 128) return Promise.reject(new Error('more than 128 keys in one delete'))
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
