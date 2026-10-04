import { createHash } from 'node:crypto'

import type { Track } from '@openframe/core/facilitation'

/** The bucket the rooms Worker serves the music from (`apps/rooms/wrangler.toml`, `LIBRARY`). */
export const LIBRARY_BUCKET = 'openframe-library'

/**
 * Why a file is not the track the catalogue describes, or `null` if it is.
 *
 * Size first, because it is free and says the most when it is wrong; then the
 * hash, which is the one a file cannot get right by accident.
 */
export function checkTrack(track: Track, bytes: Uint8Array): string | null {
  if (bytes.byteLength !== track.bytes) {
    return `${track.id} is ${String(bytes.byteLength)} bytes, not ${String(track.bytes)}`
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== track.sha256) return `${track.id} is not the file the catalogue describes`
  return null
}

/** The `wrangler` arguments that put one track in the library. */
export function uploadCommand(track: Track, file: string, local: boolean): string[] {
  return [
    'r2',
    'object',
    'put',
    `${LIBRARY_BUCKET}/audio/${track.id}`,
    '--file',
    file,
    '--content-type',
    track.mime,
    local ? '--local' : '--remote',
  ]
}
