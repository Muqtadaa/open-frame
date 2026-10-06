import type { BoardId } from '@openframe/core'
import { VERSION_ID } from '@openframe/core/history'

import type { BoardHistory, OpenedVersion, VersionListing } from '../../runtime/board-history.js'
import type { RoomCredentials } from './room-asset-store.js'

/**
 * A shared board's history, read from its room (ADR 0019).
 *
 * The credentials travel in headers, as for an image: a read is not a link
 * anybody pastes, and a credential in a URL is a credential in an access log.
 * A version arrives gzipped and is opened here; the Yjs inside is decoded by
 * `decode`, handed in by the composition root, because nothing outside
 * `@openframe/collab` may know Yjs exists.
 */
export interface RoomHistoryOptions {
  readonly base: string
  readonly boardId: BoardId
  readonly credentials: () => RoomCredentials
  readonly decode: (bytes: Uint8Array) => Promise<{
    readonly title: string | null
    readonly objects: readonly unknown[]
  }>
  readonly fetch: typeof globalThis.fetch
}

export function createRoomHistory(options: RoomHistoryOptions): BoardHistory {
  const url = `${options.base}/room/${encodeURIComponent(options.boardId)}/versions`
  const headers = (): Record<string, string> => {
    const { key, owner, token } = options.credentials()
    return {
      ...(key === null ? {} : { 'x-openframe-key': key }),
      ...(owner === null ? {} : { 'x-openframe-owner': owner }),
      ...(token === null ? {} : { 'x-openframe-token': token }),
    }
  }

  return {
    list: async () => {
      try {
        const response = await options.fetch(url, { headers: headers(), cache: 'no-store' })
        if (!response.ok) return null
        return listingsOf(await response.json())
      } catch {
        return null
      }
    },

    open: async (id): Promise<OpenedVersion> => {
      if (!VERSION_ID.test(id)) return { status: 'missing' }
      let bytes: Uint8Array
      try {
        const response = await options.fetch(`${url}/${id}`, { headers: headers() })
        if (response.status === 404) return { status: 'missing' }
        if (!response.ok || response.body === null) return { status: 'unreachable' }
        bytes = await gunzip(response.body)
      } catch {
        return { status: 'unreachable' }
      }
      try {
        const decoded = await options.decode(bytes)
        return { status: 'ok', title: decoded.title, objects: decoded.objects }
      } catch {
        return { status: 'unreadable' }
      }
    },

    keepNow: async () => {
      try {
        const response = await options.fetch(url, { method: 'POST', headers: headers() })
        return response.ok
      } catch {
        return false
      }
    },
  }
}

async function gunzip(body: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  // The cast settles a typing the DOM library gets wrong: a decompressor
  // takes bytes, which is exactly what a response body is.
  const opened = body.pipeThrough(
    new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>,
  )
  return new Uint8Array(await new Response(opened).arrayBuffer())
}

/** The room's answer, read without trusting it: a malformed entry is left out. */
function listingsOf(body: unknown): VersionListing[] | null {
  if (typeof body !== 'object' || body === null) return null
  const versions = (body as { versions?: unknown }).versions
  if (!Array.isArray(versions)) return null
  const listed: VersionListing[] = []
  for (const entry of versions as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue
    const { id, at, kind, name } = entry as Record<string, unknown>
    if (typeof id !== 'string' || !VERSION_ID.test(id)) continue
    if (typeof at !== 'number' || !Number.isFinite(at)) continue
    if (kind !== 'auto' && kind !== 'named') continue
    listed.push(typeof name === 'string' ? { id, at, kind, name } : { id, at, kind })
  }
  return listed.sort((a, b) => b.at - a.at)
}
