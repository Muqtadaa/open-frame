import { describe, expect, it } from 'vitest'

import { encodeReactions, groupReactions } from './use-reactions.js'

/**
 * The reactions on a note travel through a string snapshot, so they compare by
 * value (rule 9). What a person typed as their name must survive the trip.
 */
describe('the reactions on a note', () => {
  it('keeps a name whole whatever characters it holds', () => {
    const groups = groupReactions(
      encodeReactions([{ glyph: 'plus-one', key: 'u_1', name: 'Ot\nter\tthe second', hue: 3 }]),
    )
    expect(groups).toEqual([
      { glyph: 'plus-one', people: [{ key: 'u_1', name: 'Ot\nter\tthe second', hue: 3 }] },
    ])
  })

  /*
   * One person, one reaction of a kind. A second record of the same — an
   * agent's, or two devices racing — is counted once, not as two people.
   */
  it('counts a person once per kind', () => {
    const groups = groupReactions(
      encodeReactions([
        { glyph: 'heart', key: 'g_a', name: 'Otter', hue: 1 },
        { glyph: 'heart', key: 'g_a', name: 'Otter', hue: 1 },
        { glyph: 'heart', key: 'g_b', name: 'Heron', hue: 2 },
      ]),
    )
    expect(groups.map((group) => group.people.length)).toEqual([2])
  })
})
