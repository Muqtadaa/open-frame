import { describe, expect, it } from 'vitest'

import { mentionsIn, unknownMentionIn } from './use-comments.js'
import type { BoardPerson } from './use-comments.js'

const person = (userId: string, displayName: string): BoardPerson => ({
  userId,
  displayName,
  hue: 0,
})

const BOARD = [person('u-sam', 'Sam'), person('u-samira', 'Samira'), person('u-rowan', 'Rowan')]

describe('who a comment is speaking to', () => {
  it('finds a name that is on the board', () => {
    expect(mentionsIn('what do you think @Rowan', BOARD)).toEqual(['u-rowan'])
  })

  it('ignores a name that is not', () => {
    expect(mentionsIn('@Jordan should see this', BOARD)).toEqual([])
  })

  /**
   * The reason the list is sorted by length.
   *
   * "Samira" contains "Sam", so a shorter name matching first would notify
   * somebody who was not being spoken to — and the test only catches it
   * because one of these names is a prefix of the other. Two unrelated names
   * would pass with the sort deleted.
   */
  it('does not notify Sam when Samira was the one addressed', () => {
    expect(mentionsIn('@Samira take a look', BOARD)).toEqual(['u-samira'])
  })

  it('is not case sensitive, because nobody types a name the way it is stored', () => {
    expect(mentionsIn('@rOwAn', BOARD)).toEqual(['u-rowan'])
  })

  it('notifies both when both were addressed', () => {
    expect(mentionsIn('@Sam and @Samira', BOARD).sort()).toEqual(['u-sam', 'u-samira'])
  })

  /**
   * The other half of the shadowing problem. "@Sam Smith" ends on a boundary
   * for BOTH names, so the longer has to be taken out of the text before the
   * shorter is looked for.
   */
  it('does not notify Sam when Sam Smith was the one addressed', () => {
    const board = [person('u-sam', 'Sam'), person('u-smith', 'Sam Smith')]
    expect(mentionsIn('@Sam Smith please look', board)).toEqual(['u-smith'])
  })

  it('handles a name with punctuation in it', () => {
    const board = [person('u-o', "O'Brien")]
    expect(mentionsIn("@O'Brien what do you think", board)).toEqual(['u-o'])
  })
})

describe('a name typed at somebody who is not here', () => {
  it('reports it', () => {
    expect(unknownMentionIn('@Jordan should see this', BOARD)).toBe('Jordan')
  })

  it('says nothing when everybody named is here', () => {
    expect(unknownMentionIn('@Sam and @Rowan', BOARD)).toBeNull()
  })

  /**
   * The forgiveness that makes this usable.
   *
   * "@Samira" is typed one letter at a time, and every prefix of it would
   * otherwise be reported as a stranger on the way through. A warning that
   * flashes while you type is noise you learn to ignore, which costs the
   * feature the one moment it is useful.
   */
  it('stays quiet while a name is still being typed', () => {
    for (const partial of ['@S', '@Sa', '@Sam', '@Sami', '@Samir', '@Samira']) {
      expect(unknownMentionIn(partial, BOARD), partial).toBeNull()
    }
  })

  it('says nothing about an @ that is not a name at all', () => {
    expect(unknownMentionIn('email me @ home', BOARD)).toBeNull()
  })

  it('reports only the first, because one offer to fix it is enough', () => {
    expect(unknownMentionIn('@Jordan and @Wren', BOARD)).toBe('Jordan')
  })

  it('handles a name outside the Latin alphabet', () => {
    expect(unknownMentionIn('@Мария', BOARD)).toBe('Мария')
    expect(unknownMentionIn('@محمد', [person('u', 'محمد')])).toBeNull()
  })
})
