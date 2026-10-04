import { readCatalogue } from '@openframe/core/facilitation'
import { describe, expect, it } from 'vitest'

import shipped from './library/catalogue.json' with { type: 'json' }

/**
 * The music library as shipped.
 *
 * Every track is played to everybody at a board, so every entry must say where
 * it came from and be CC0 — and the reader leaving an entry out is not good
 * enough here: an entry that would be left out must never be shipped at all.
 */
describe('the shipped catalogue', () => {
  it('is a catalogue, and every entry in it is readable', () => {
    const read = readCatalogue(shipped)
    expect(read).not.toBeNull()
    expect(read?.tracks).toHaveLength(shipped.tracks.length)
  })
})
