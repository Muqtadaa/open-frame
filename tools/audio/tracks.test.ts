import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'

import type { Track } from '@openframe/core/facilitation'

import { checkTrack, uploadCommand } from './tracks.js'

/**
 * Before a track goes into the library, it has to be the file the catalogue
 * says it is: the catalogue is what was reviewed, and a different file under
 * the same id would be a different recording nobody approved.
 */

const bytes = new Uint8Array([1, 2, 3, 4, 5])
const track: Track = {
  id: 'calm-1',
  genre: 'ambient-lofi',
  title: 'Still',
  artist: 'Somebody',
  durationMs: 60_000,
  bytes: bytes.byteLength,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  mime: 'audio/mpeg',
  licence: 'CC0-1.0',
  sourceUrl: 'https://freesound.org/s/1/',
  retrievedAt: '2026-10-04',
}

void describe('checking a track against the catalogue', () => {
  void it('passes the file the catalogue describes', () => {
    assert.equal(checkTrack(track, bytes), null)
  })

  void it('refuses a file of another size', () => {
    assert.match(checkTrack(track, new Uint8Array([1, 2, 3])) ?? '', /3 bytes, not 5/)
  })

  void it('refuses a file with other contents, even of the same size', () => {
    assert.match(checkTrack(track, new Uint8Array([5, 4, 3, 2, 1])) ?? '', /not the file/)
  })
})

void describe('putting a track in the library', () => {
  void it('names its key, its type and the bucket', () => {
    assert.deepEqual(uploadCommand(track, '/tmp/calm-1.mp3', false), [
      'r2',
      'object',
      'put',
      'openframe-library/audio/calm-1',
      '--file',
      '/tmp/calm-1.mp3',
      '--content-type',
      'audio/mpeg',
      '--remote',
    ])
  })

  void it('goes to the local library for development', () => {
    assert.ok(uploadCommand(track, '/tmp/calm-1.mp3', true).includes('--local'))
  })
})
