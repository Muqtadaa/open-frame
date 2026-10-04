import { describe, expect, it } from 'vitest'

import {
  MUSIC_GENRES,
  pauseMusic,
  playMusic,
  playlistOf,
  positionOf,
  readCatalogue,
  readMusic,
  setGenre,
  stopMusic,
  stoppedMusic,
  type Catalogue,
  type Track,
} from './music.js'

/**
 * Session music: one playlist per genre, at the same place on every device.
 *
 * Which track is playing, and how far into it, is worked out from the room's
 * clock and never stored — exactly as the timer's "done" is.
 */

const SECOND = 1000
const by = 'Ada'

function track(id: string, genre: Track['genre'], durationMs: number): Track {
  return {
    id,
    genre,
    title: `Title ${id}`,
    artist: 'Somebody',
    durationMs,
    bytes: 1024,
    sha256: 'a'.repeat(64),
    mime: 'audio/mpeg',
    licence: 'CC0-1.0',
    sourceUrl: `https://freesound.org/s/${id}/`,
    retrievedAt: '2026-10-04',
  }
}

const catalogue: Catalogue = {
  v: 1,
  tracks: [
    track('a', 'calm', 60 * SECOND),
    track('b', 'jazzy', 30 * SECOND),
    track('c', 'calm', 90 * SECOND),
  ],
}
const calm = playlistOf(catalogue, 'calm')

describe('the catalogue', () => {
  it('names five genres', () => {
    expect(MUSIC_GENRES).toEqual(['electronic', 'jazzy', 'synthwave', 'bossa-nova', 'calm'])
  })

  it('reads one it wrote', () => {
    expect(readCatalogue(structuredClone(catalogue))).toEqual(catalogue)
  })

  it('keeps a genre’s tracks in catalogue order', () => {
    expect(calm.map((t) => t.id)).toEqual(['a', 'c'])
  })

  /*
   * The tracks are played to everybody at the board, so a track nobody can
   * show the licence of is not one to play — whatever wrote it.
   */
  it('leaves out a track that is not CC0, or not a track, and keeps the rest', () => {
    const read = readCatalogue({
      v: 1,
      tracks: [
        { ...track('ok', 'calm', SECOND * 10) },
        { ...track('cc-by', 'calm', SECOND * 10), licence: 'CC-BY-4.0' },
        { ...track('extra', 'calm', SECOND * 10), mood: 'sunny' },
        { ...track('no-source', 'calm', SECOND * 10), sourceUrl: 'not a url' },
        'a string',
      ],
    })
    expect(read?.tracks.map((t) => t.id)).toEqual(['ok'])
  })

  it('keeps the first of two tracks with one id', () => {
    const read = readCatalogue({
      v: 1,
      tracks: [track('x', 'calm', 1000), track('x', 'jazzy', 2000)],
    })
    expect(read?.tracks).toHaveLength(1)
    expect(read?.tracks[0]?.genre).toBe('calm')
  })

  it.each([null, { v: 2, tracks: [] }, { tracks: [] }, { v: 1, tracks: 'all' }])(
    'refuses %j',
    (value) => {
      expect(readCatalogue(value)).toBeNull()
    },
  )
})

describe('where the music is', () => {
  it('is nowhere while stopped', () => {
    expect(positionOf(stoppedMusic(), 5000)).toBeNull()
  })

  it('counts from when it started, across tracks', () => {
    const music = playMusic(stoppedMusic('calm'), 1000, by, calm)
    expect(positionOf(music, 1000 + 10 * SECOND)).toMatchObject({
      index: 0,
      trackId: 'a',
      offsetMs: 10 * SECOND,
    })
    expect(positionOf(music, 1000 + 70 * SECOND)).toMatchObject({
      index: 1,
      trackId: 'c',
      offsetMs: 10 * SECOND,
    })
  })

  it('goes round again after the last track', () => {
    const music = playMusic(stoppedMusic('calm'), 0, by, calm)
    expect(positionOf(music, 160 * SECOND)).toMatchObject({ index: 0, offsetMs: 10 * SECOND })
  })

  it('holds still while paused, and carries on from there', () => {
    const paused = pauseMusic(playMusic(stoppedMusic('calm'), 0, by, calm), 20 * SECOND, by)
    expect(positionOf(paused, 999 * SECOND)).toMatchObject({ index: 0, offsetMs: 20 * SECOND })
    const resumed = playMusic(paused, 100 * SECOND, by, [])
    expect(positionOf(resumed, 105 * SECOND)).toMatchObject({ index: 0, offsetMs: 25 * SECOND })
  })

  it('is nowhere for a genre with no tracks', () => {
    const music = playMusic(stoppedMusic('synthwave'), 0, by, playlistOf(catalogue, 'synthwave'))
    expect(positionOf(music, 1000)).toBeNull()
  })

  it('starts a new genre from its first track', () => {
    const jazzy = playlistOf(catalogue, 'jazzy')
    const music = setGenre(
      playMusic(stoppedMusic('calm'), 0, by, calm),
      'jazzy',
      50 * SECOND,
      by,
      jazzy,
    )
    expect(music.genre).toBe('jazzy')
    expect(positionOf(music, 55 * SECOND)).toMatchObject({ trackId: 'b', offsetMs: 5 * SECOND })
  })

  it('stops back to the start', () => {
    const stopped = stopMusic(playMusic(stoppedMusic('calm'), 0, by, calm), 10, by)
    expect(stopped.status).toBe('stopped')
    expect(positionOf(playMusic(stopped, 100, by, calm), 100)).toMatchObject({
      index: 0,
      offsetMs: 0,
    })
  })

  it('counts each start from silence as a new run', () => {
    const first = playMusic(stoppedMusic(), 0, by, calm)
    expect(playMusic(stopMusic(first, 1, by), 2, by, calm).run).toBe(first.run + 1)
    expect(playMusic(pauseMusic(first, 1, by), 2, by, calm).run).toBe(first.run)
  })

  /*
   * Every device works the position out for itself, so every device must work
   * it out from the SAME list. A device that had loaded the catalogue before a
   * track was added would otherwise play something else, at another place, for
   * as long as the session ran (Codex, on #64). The run carries its playlist.
   */
  it('plays the playlist it started with, whatever the catalogue says now', () => {
    const music = playMusic(stoppedMusic('calm'), 0, by, calm)
    const later: Catalogue = {
      v: 1,
      tracks: [track('new', 'calm', 5 * SECOND), ...catalogue.tracks],
    }
    expect(playlistOf(later, 'calm')[0]?.id).toBe('new')
    expect(positionOf(music, 10 * SECOND)).toMatchObject({ trackId: 'a', offsetMs: 10 * SECOND })
  })

  it('keeps only what a position needs, so the record stays small', () => {
    const music = playMusic(stoppedMusic('calm'), 0, by, calm)
    expect(music.playlist).toEqual([
      { id: 'a', durationMs: 60 * SECOND },
      { id: 'c', durationMs: 90 * SECOND },
    ])
  })
})

describe('reading music someone else wrote', () => {
  it('reads one it wrote itself', () => {
    const music = playMusic(stoppedMusic('jazzy'), 1000, by, playlistOf(catalogue, 'jazzy'))
    expect(readMusic(structuredClone(music))).toEqual(music)
  })

  it.each([
    ['nothing', null],
    ['an unknown genre', { ...stoppedMusic(), genre: 'polka' }],
    ['playing with no start', { ...stoppedMusic(), status: 'playing', anchor: null }],
    ['an extra field', { ...stoppedMusic(), volume: 11 }],
    ['a newer version', { ...stoppedMusic(), v: 2 }],
    [
      'a playlist entry that is not a track',
      { ...stoppedMusic(), playlist: [{ id: '../x', durationMs: 1000 }] },
    ],
  ])('refuses %s', (_, value) => {
    expect(readMusic(value)).toBeNull()
  })
})
