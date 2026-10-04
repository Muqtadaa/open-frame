import type { Catalogue } from '@openframe/core/facilitation'

/**
 * Serving the session music's tracks (ADR 0017), as pure functions of their
 * inputs so they are tested in Node rather than only through a deployed room.
 *
 * Range is the point. A browser seeks by asking for a byte range, and every
 * device joining a board's music seeks to wherever everybody else is — a
 * server that ignored `Range` would make each of those a download from the top.
 */

export interface ByteRange {
  readonly start: number
  readonly end: number
}

/**
 * The single range a `Range` header asks for, held to the file; `'unsatisfiable'`
 * for one that starts past the end; `null` for no header, or one this does not
 * read (several ranges, another unit) — in which case the whole file is sent,
 * which is always a correct answer.
 */
export function parseRange(
  header: string | null,
  size: number,
): ByteRange | 'unsatisfiable' | null {
  if (header === null) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (match === null) return null
  const [, from = '', to = ''] = match
  if (from === '' && to === '') return null
  if (from === '') {
    // The last n bytes.
    const last = Number(to)
    if (last === 0) return 'unsatisfiable'
    return { start: Math.max(0, size - last), end: size - 1 }
  }
  const start = Number(from)
  const end = to === '' ? size - 1 : Math.min(Number(to), size - 1)
  if (start >= size) return 'unsatisfiable'
  if (end < start) return null
  return { start, end }
}

/**
 * Headers for a track, whole or in part.
 *
 * Public and long-cached: a track's id names one recording forever, and a new
 * recording gets a new id. The range headers are exposed so the page can read
 * them across origins, which an `<audio>` element does not need but a check of
 * one does.
 */
export function trackHeaders(input: {
  readonly mime: string
  readonly size: number
  readonly range: ByteRange | null
}): Record<string, string> {
  const { mime, size, range } = input
  const headers: Record<string, string> = {
    'content-type': mime,
    'accept-ranges': 'bytes',
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'content-range, content-length, accept-ranges',
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    'content-length': String(range === null ? size : range.end - range.start + 1),
  }
  if (range !== null)
    headers['content-range'] = `bytes ${String(range.start)}-${String(range.end)}/${String(size)}`
  return headers
}

/** Where a track lives in the library bucket. */
export function trackKey(trackId: string): string {
  return `audio/${trackId}`
}

/**
 * The little of an R2 bucket a track needs, so tests can hand in an in-memory
 * one — the same seam `AssetBucket` is for images.
 */
export interface TrackBucket {
  get: (
    key: string,
    options?: { readonly range?: { readonly offset: number; readonly length: number } },
  ) => Promise<{ readonly body: ReadableStream | null } | null>
}

const NOT_FOUND = { 'access-control-allow-origin': '*' }

/**
 * One track, whole or in part.
 *
 * The CATALOGUE says what may be served, not the bucket: a file uploaded but
 * never approved, or one an id was guessed for, is not reachable. Its size is
 * the catalogue's, which the upload script checks against the file.
 */
export async function serveTrack(
  bucket: TrackBucket,
  catalogue: Catalogue,
  trackId: string,
  request: Request,
): Promise<Response> {
  const track = catalogue.tracks.find((entry) => entry.id === trackId)
  if (track === undefined) return new Response('No such track', { status: 404, headers: NOT_FOUND })

  const range = parseRange(request.headers.get('range'), track.bytes)
  if (range === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { ...NOT_FOUND, 'content-range': `bytes */${String(track.bytes)}` },
    })
  }
  const headers = trackHeaders({ mime: track.mime, size: track.bytes, range })
  const status = range === null ? 200 : 206
  if (request.method === 'HEAD') return new Response(null, { status, headers })

  const object = await bucket.get(
    trackKey(trackId),
    range === null
      ? undefined
      : { range: { offset: range.start, length: range.end - range.start + 1 } },
  )
  if (object === null) {
    return new Response('That track is not in the library yet', { status: 404, headers: NOT_FOUND })
  }
  return new Response(object.body, { status, headers })
}

/**
 * The catalogue, briefly cached: a newly approved track should reach people
 * within minutes, and the list is a few kilobytes at most.
 */
export function serveCatalogue(catalogue: Catalogue): Response {
  return new Response(JSON.stringify(catalogue), {
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=300',
    },
  })
}
