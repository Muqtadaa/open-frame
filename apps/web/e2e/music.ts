import type { Page } from '@playwright/test'
import type { MusicGenre } from '@openframe/core/facilitation'

/**
 * A stand-in music library for the browser suites, served from where the app
 * expects the room server to be. The production catalogue ships empty until
 * tracks are approved, so every music test brings its own.
 */

/** Where the e2e build's room server would be (`playwright.config.ts`). */
export const ROOM_HTTP = 'http://127.0.0.1:59999'

/** A few seconds of silence as a WAV: 8kHz, mono, 8-bit. Built here, so no audio file ships (rule 12). */
export function silence(seconds: number): Buffer {
  const samples = 8000 * seconds
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + samples, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(8000, 24)
  header.writeUInt32LE(8000, 28)
  header.writeUInt16LE(1, 32)
  header.writeUInt16LE(8, 34)
  header.write('data', 36)
  header.writeUInt32LE(samples, 40)
  return Buffer.concat([header, Buffer.alloc(samples, 128)])
}

export interface StubTrack {
  readonly id: string
  readonly genre: MusicGenre
  readonly title: string
}

const CLIP = silence(3)

/**
 * The clip is three seconds; the catalogue may say a track is longer, because
 * where the music IS comes from the room's clock and the catalogue, never
 * from the file — which is what lets a test read a position that is not
 * forever wrapping round.
 */
export function catalogueOf(tracks: readonly StubTrack[], durationMs = 120_000): unknown {
  return {
    v: 1,
    tracks: tracks.map((track) => ({
      ...track,
      artist: 'Test Artist',
      durationMs,
      bytes: CLIP.byteLength,
      sha256: 'a'.repeat(64),
      mime: 'audio/wav',
      licence: 'CC0-1.0',
      sourceUrl: `https://freesound.org/s/${track.id}/`,
      retrievedAt: '2026-10-04',
    })),
  }
}

/** Serves `tracks` as the library, or no library at all for `null`. */
export async function library(
  page: Page,
  tracks: readonly StubTrack[] | null,
  base = ROOM_HTTP,
): Promise<void> {
  await page.route(`${base}/music/catalogue`, (route) =>
    tracks === null
      ? route.fulfill({ status: 404, body: 'none' })
      : route.fulfill({
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify(catalogueOf(tracks)),
        }),
  )
  await page.route(`${base}/music/track/*`, (route) =>
    route.fulfill({
      contentType: 'audio/wav',
      headers: { 'access-control-allow-origin': '*' },
      body: CLIP,
    }),
  )
}

export const TRACKS: readonly StubTrack[] = [
  { id: 'calm-1', genre: 'ambient-lofi', title: 'Still Water' },
  { id: 'jazzy-1', genre: 'jazzhop', title: 'Late Set' },
]
