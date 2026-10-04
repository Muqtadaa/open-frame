import { describe, expect, it, vi } from 'vitest'

import { createMusicClient } from './music-client.js'

/**
 * The music library's catalogue, read from the room server (ADR 0017).
 *
 * Read through the shared strict reader: the server is trusted, but what it
 * sends crossed a network, and a track the browser would refuse must not
 * reach a player.
 */
const TRACK = {
  id: 'calm-1',
  genre: 'calm',
  title: 'Still',
  artist: 'Somebody',
  durationMs: 60_000,
  bytes: 1024,
  sha256: 'a'.repeat(64),
  mime: 'audio/mpeg',
  licence: 'CC0-1.0',
  sourceUrl: 'https://freesound.org/s/1/',
  retrievedAt: '2026-10-04',
}

const respond = (body: unknown, status = 200) =>
  vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })))

describe('the music client', () => {
  it('reads the catalogue from the room server', async () => {
    const fetch = respond({ v: 1, tracks: [TRACK] })
    const client = createMusicClient({ base: 'https://rooms.example', fetch })
    expect((await client.catalogue())?.tracks).toEqual([TRACK])
    expect(fetch).toHaveBeenCalledWith('https://rooms.example/music/catalogue', undefined)
  })

  it('has no catalogue when the server is unreachable, refuses, or sends something else', async () => {
    const base = 'https://rooms.example'
    expect(
      await createMusicClient({
        base,
        fetch: vi.fn(() => Promise.reject(new Error('offline'))),
      }).catalogue(),
    ).toBeNull()
    expect(await createMusicClient({ base, fetch: respond({}, 500) }).catalogue()).toBeNull()
    expect(await createMusicClient({ base, fetch: respond('a song') }).catalogue()).toBeNull()
  })

  it('names a track by its place in the library', () => {
    const client = createMusicClient({ base: 'https://rooms.example', fetch: respond({}) })
    expect(client.trackUrl('calm-1')).toBe('https://rooms.example/music/track/calm-1')
  })
})
