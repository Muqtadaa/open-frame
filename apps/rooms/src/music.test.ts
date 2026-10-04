import { describe, expect, it } from 'vitest'

import type { Catalogue } from '@openframe/core/facilitation'

import { parseRange, serveCatalogue, serveTrack, trackHeaders, type TrackBucket } from './music.js'

/**
 * Serving a track so an `<audio>` element can seek in it.
 *
 * A browser seeks by asking for a byte range. A server that ignores `Range`
 * and sends the whole file makes every seek a download from the top — and
 * playing everybody at the same place means seeking on every join.
 */
describe('a byte range', () => {
  const size = 1000

  it('reads a closed range', () => {
    expect(parseRange('bytes=0-99', size)).toEqual({ start: 0, end: 99 })
  })

  it('reads an open one to the end', () => {
    expect(parseRange('bytes=900-', size)).toEqual({ start: 900, end: 999 })
  })

  it('reads the last n bytes', () => {
    expect(parseRange('bytes=-100', size)).toEqual({ start: 900, end: 999 })
  })

  it('holds an end past the file to the file', () => {
    expect(parseRange('bytes=500-5000', size)).toEqual({ start: 500, end: 999 })
  })

  it('says a range past the end cannot be met', () => {
    expect(parseRange('bytes=1000-', size)).toBe('unsatisfiable')
  })

  it.each([null, '', 'items=0-1', 'bytes=5-2', 'bytes=0-1,4-5', 'bytes=abc'])(
    'ignores %j, so the whole file is sent',
    (header) => {
      expect(parseRange(header, size)).toBeNull()
    },
  )
})

describe('a track’s headers', () => {
  it('says the whole file can be had in pieces, from anywhere, for a long time', () => {
    const headers = trackHeaders({ mime: 'audio/mpeg', size: 1000, range: null })
    expect(headers).toMatchObject({
      'content-type': 'audio/mpeg',
      'content-length': '1000',
      'accept-ranges': 'bytes',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    })
    expect(headers['content-range']).toBeUndefined()
  })

  it('names the piece it is sending, and lets the page read that', () => {
    const headers = trackHeaders({
      mime: 'audio/mpeg',
      size: 1000,
      range: { start: 100, end: 199 },
    })
    expect(headers['content-range']).toBe('bytes 100-199/1000')
    expect(headers['content-length']).toBe('100')
    expect(headers['access-control-expose-headers']).toContain('content-range')
  })
})

const BYTES = new Uint8Array(1000).map((_, index) => index % 256)

const catalogue: Catalogue = {
  v: 1,
  tracks: [
    {
      id: 'calm-1',
      genre: 'calm',
      title: 'Still',
      artist: 'Somebody',
      durationMs: 60_000,
      bytes: BYTES.byteLength,
      sha256: 'a'.repeat(64),
      mime: 'audio/mpeg',
      licence: 'CC0-1.0',
      sourceUrl: 'https://freesound.org/s/1/',
      retrievedAt: '2026-10-04',
    },
  ],
}

/** An in-memory library holding one file, recording what it was asked for. */
function bucket(): TrackBucket & { asked: { key: string; range?: unknown }[] } {
  const asked: { key: string; range?: unknown }[] = []
  return {
    asked,
    get: (key, options) => {
      asked.push({ key, range: options?.range })
      if (key !== 'audio/calm-1') return Promise.resolve(null)
      const range = options?.range
      const slice =
        range === undefined ? BYTES : BYTES.slice(range.offset, range.offset + range.length)
      return Promise.resolve({ body: new Blob([slice]).stream() })
    },
  }
}

const request = (headers: Record<string, string> = {}, method = 'GET') =>
  new Request('https://r.dev/music/track/calm-1', { method, headers })

describe('serving a track', () => {
  it('sends the whole file when no range is asked for', async () => {
    const response = await serveTrack(bucket(), catalogue, 'calm-1', request())
    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BYTES)
  })

  it('sends just the piece asked for, and says which', async () => {
    const library = bucket()
    const response = await serveTrack(
      library,
      catalogue,
      'calm-1',
      request({ range: 'bytes=100-199' }),
    )
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 100-199/1000')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BYTES.slice(100, 200))
    expect(library.asked[0]?.range).toEqual({ offset: 100, length: 100 })
  })

  it('says a range past the end cannot be met', async () => {
    const response = await serveTrack(
      bucket(),
      catalogue,
      'calm-1',
      request({ range: 'bytes=5000-' }),
    )
    expect(response.status).toBe(416)
    expect(response.headers.get('content-range')).toBe('bytes */1000')
  })

  it('answers a HEAD with the headers alone', async () => {
    const response = await serveTrack(bucket(), catalogue, 'calm-1', request({}, 'HEAD'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe('1000')
    expect(await response.text()).toBe('')
  })

  /*
   * The catalogue is the list of what may be served. A file in the bucket that
   * nothing lists — a candidate nobody approved — is not served by guessing its id.
   */
  it('serves nothing the catalogue does not list, whatever the bucket holds', async () => {
    const library = bucket()
    const response = await serveTrack(library, { v: 1, tracks: [] }, 'calm-1', request())
    expect(response.status).toBe(404)
    expect(library.asked).toEqual([])
  })

  it('says so when a listed track is not in the bucket yet', async () => {
    const missing = { ...catalogue, tracks: [{ ...catalogue.tracks[0]!, id: 'calm-2' }] }
    const response = await serveTrack(bucket(), missing, 'calm-2', request())
    expect(response.status).toBe(404)
  })
})

describe('serving the catalogue', () => {
  it('is JSON anybody may read, and short-lived, so an approved track appears soon', async () => {
    const response = serveCatalogue(catalogue)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('cache-control')).toBe('public, max-age=300')
    expect(await response.json()).toEqual(catalogue)
  })
})
