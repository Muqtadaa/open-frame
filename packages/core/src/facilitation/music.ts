import { z } from 'zod'

/**
 * Session music: one playlist per genre, at the same place on every device at
 * the board (ADR 0017).
 *
 * Like the timer, it is the state of a meeting about the board rather than
 * part of it, and like the timer's "done", WHICH track is playing and how far
 * into it is never stored. The record says when the playlist started on the
 * room's clock; every device works out the rest, so a device that arrives late
 * or wakes from sleep lands where everybody else is without asking anyone.
 *
 * The catalogue is shared by the rooms worker, which serves the tracks, and
 * the browser, which plays them — the same rules on both sides, as for uploads.
 */

export const MUSIC_VERSION = 1
export const CATALOGUE_VERSION = 1

export const MUSIC_GENRES = ['electronic', 'jazzy', 'synthwave', 'bossa-nova', 'calm'] as const
export type MusicGenre = (typeof MUSIC_GENRES)[number]

/** What a track may be stored as. Production tracks are MP3; the others are for tests and later choices. */
export const TRACK_MIMES = ['audio/mpeg', 'audio/ogg', 'audio/wav'] as const

/** A track id is also its key in the bucket, so it is kept to what a path can hold plainly. */
export const TRACK_ID = /^[a-z0-9-]{1,48}$/

const TrackSchema = z.strictObject({
  id: z.string().regex(TRACK_ID),
  genre: z.enum(MUSIC_GENRES),
  title: z.string().min(1).max(200),
  artist: z.string().min(1).max(200),
  durationMs: z
    .number()
    .int()
    .min(1000)
    .max(60 * 60 * 1000),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  mime: z.enum(TRACK_MIMES),
  /*
   * CC0 and nothing else: these are played to everybody at a board, and a
   * licence that needs attribution or forbids some use is one this product
   * cannot honour on their behalf.
   */
  licence: z.literal('CC0-1.0'),
  sourceUrl: z.url({ protocol: /^https$/ }),
  retrievedAt: z.iso.date(),
})

export type Track = z.infer<typeof TrackSchema>

export interface Catalogue {
  readonly v: typeof CATALOGUE_VERSION
  readonly tracks: readonly Track[]
}

const CatalogueEnvelope = z.strictObject({
  v: z.literal(CATALOGUE_VERSION),
  tracks: z.array(z.unknown()),
})

/**
 * A catalogue as this side can use it, or `null` if it is not one at all.
 *
 * A track that fails is LEFT OUT rather than failing the whole list: one bad
 * entry should cost that entry, not every genre. The first of two tracks with
 * one id wins, because the id is the file it names.
 */
export function readCatalogue(value: unknown): Catalogue | null {
  const envelope = CatalogueEnvelope.safeParse(value)
  if (!envelope.success) return null
  const seen = new Set<string>()
  const tracks: Track[] = []
  for (const entry of envelope.data.tracks) {
    const track = TrackSchema.safeParse(entry)
    if (!track.success || seen.has(track.data.id)) continue
    seen.add(track.data.id)
    tracks.push(track.data)
  }
  return { v: CATALOGUE_VERSION, tracks }
}

/** A genre's tracks, in the order the catalogue lists them. */
export function playlistOf(catalogue: Catalogue, genre: MusicGenre): readonly Track[] {
  return catalogue.tracks.filter((track) => track.genre === genre)
}

export type MusicStatus = 'stopped' | 'playing' | 'paused'

/** What a position needs of a track, and all the record carries of one. */
export interface PinnedTrack {
  readonly id: string
  readonly durationMs: number
}

/** A genre's playlist is short; this keeps a record that any editor can write from growing without end. */
export const MAX_PLAYLIST = 50

export interface SessionMusic {
  readonly v: typeof MUSIC_VERSION
  readonly genre: MusicGenre
  readonly status: MusicStatus
  /** When the playlist's first track began, on the room's clock. `null` unless playing. */
  readonly anchor: number | null
  /** How far into the playlist it was when paused. Zero while stopped. */
  readonly pausedAtMs: number
  /**
   * The playlist this run plays, pinned when it started or changed genre.
   *
   * Every device works the position out for itself, so every device has to
   * work it out from the SAME list: a tab that loaded the catalogue before a
   * track was approved would otherwise play another track, at another place,
   * for as long as the session ran (Codex, on #64). The catalogue is consulted
   * only for a track's title and where to stream it from.
   */
  readonly playlist: readonly PinnedTrack[]
  /** Which start from silence this is; pausing and resuming is the same run. */
  readonly run: number
  readonly by: string | null
  readonly at: number
}

const MusicSchema = z
  .strictObject({
    v: z.literal(MUSIC_VERSION),
    genre: z.enum(MUSIC_GENRES),
    status: z.enum(['stopped', 'playing', 'paused']),
    anchor: z.number().finite().nullable(),
    pausedAtMs: z.number().finite().min(0),
    playlist: z
      .array(
        z.strictObject({
          id: z.string().regex(TRACK_ID),
          durationMs: z
            .number()
            .int()
            .min(1000)
            .max(60 * 60 * 1000),
        }),
      )
      .max(MAX_PLAYLIST),
    run: z.number().int().min(0),
    by: z.string().max(200).nullable(),
    at: z.number().finite(),
  })
  .refine((music) => (music.status === 'playing') === (music.anchor !== null))

/** Music as this client can use it, or `null`. Any editor can write it (rule 8). */
export function readMusic(value: unknown): SessionMusic | null {
  const parsed = MusicSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function stoppedMusic(genre: MusicGenre = 'calm'): SessionMusic {
  return {
    v: MUSIC_VERSION,
    genre,
    status: 'stopped',
    anchor: null,
    pausedAtMs: 0,
    playlist: [],
    run: 0,
    by: null,
    at: 0,
  }
}

function pin(playlist: readonly PinnedTrack[]): PinnedTrack[] {
  return playlist.slice(0, MAX_PLAYLIST).map(({ id, durationMs }) => ({ id, durationMs }))
}

/**
 * Starts from silence with `playlist` pinned, or carries on from a pause with
 * the playlist it already has. Already playing is left alone.
 */
export function playMusic(
  music: SessionMusic,
  now: number,
  by: string | null,
  playlist: readonly PinnedTrack[],
): SessionMusic {
  switch (music.status) {
    case 'playing':
      return music
    case 'paused':
      return { ...music, status: 'playing', anchor: now - music.pausedAtMs, by, at: now }
    case 'stopped':
      return {
        ...music,
        status: 'playing',
        anchor: now,
        pausedAtMs: 0,
        playlist: pin(playlist),
        run: music.run + 1,
        by,
        at: now,
      }
  }
}

export function pauseMusic(music: SessionMusic, now: number, by: string | null): SessionMusic {
  if (music.status !== 'playing' || music.anchor === null) return music
  return {
    ...music,
    status: 'paused',
    anchor: null,
    pausedAtMs: Math.max(0, now - music.anchor),
    by,
    at: now,
  }
}

export function stopMusic(music: SessionMusic, now: number, by: string | null): SessionMusic {
  return { ...music, status: 'stopped', anchor: null, pausedAtMs: 0, by, at: now }
}

/**
 * Another genre, from its first track. Playing music keeps playing — the room
 * asked for jazz, not for silence — and paused music stays paused at the top.
 */
export function setGenre(
  music: SessionMusic,
  genre: MusicGenre,
  now: number,
  by: string | null,
  playlist: readonly PinnedTrack[],
): SessionMusic {
  if (music.genre === genre) return music
  return {
    ...music,
    genre,
    playlist: pin(playlist),
    anchor: music.status === 'playing' ? now : null,
    pausedAtMs: 0,
    by,
    at: now,
  }
}

export interface MusicPosition {
  readonly index: number
  readonly trackId: string
  readonly durationMs: number
  readonly offsetMs: number
}

/**
 * Which track, and how far into it, at `now` — or `null` while stopped or for
 * a run with nothing in its playlist. The playlist loops, so this is defined
 * for any time after the start. Only the record is read: the catalogue does
 * not enter into where the music is.
 */
export function positionOf(music: SessionMusic, now: number): MusicPosition | null {
  const { playlist } = music
  if (music.status === 'stopped' || playlist.length === 0) return null
  const total = playlist.reduce((sum, track) => sum + track.durationMs, 0)
  const elapsed =
    music.status === 'playing' && music.anchor !== null ? now - music.anchor : music.pausedAtMs
  let into = ((elapsed % total) + total) % total
  for (const [index, track] of playlist.entries()) {
    if (into < track.durationMs) {
      return { index, trackId: track.id, durationMs: track.durationMs, offsetMs: into }
    }
    into -= track.durationMs
  }
  // Unreachable: `into` is below the sum of the durations it walks.
  return null
}
