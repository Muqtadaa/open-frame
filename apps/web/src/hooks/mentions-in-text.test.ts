import { describe, expect, it } from 'vitest'

import {
  activeMentionQuery,
  insertMention,
  mentionSegments,
  mentionToken,
  mentionsIn,
  peopleMatching,
  plainMentionText,
  tokeniseMentions,
  unknownMentionIn,
} from './use-comments.js'
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

describe('a mention written as a token', () => {
  const JILL = person('u-jill', 'Jill')

  it('reaches the person it names', () => {
    expect(mentionsIn(`${mentionToken(JILL)} have a look`, [JILL])).toEqual(['u-jill'])
  })

  /**
   * The reason the token exists at all.
   *
   * The body was written when she was called "Jill"; she is called "Jill
   * Okonkwo" now. Name matching cannot find her — "@Jill" no longer equals
   * anybody's display name — so under plain text this mention would quietly
   * stop reaching her. The id in the token never changed.
   */
  it('survives the person being renamed', () => {
    const written = `${mentionToken(JILL)} have a look`
    const renamed = [person('u-jill', 'Jill Okonkwo')]
    expect(mentionsIn(written, renamed)).toEqual(['u-jill'])
  })

  /**
   * The other thing a name cannot express. Two accounts, one display name:
   * text says "@Kat" and means exactly one of them, and there is no way to
   * tell which. The token says which.
   */
  it('tells two people with the same name apart', () => {
    const board = [person('u-kat-1', 'Kat'), person('u-kat-2', 'Kat')]
    expect(mentionsIn(`${mentionToken(board[1]!)} which one`, board)).toEqual(['u-kat-2'])
  })

  /**
   * A body pasted from another board carries ids for people who are not here.
   * The database refuses such a row — the insert policy checks membership —
   * and one refused mention takes the whole comment down with it.
   */
  it('drops an id that is not on this board', () => {
    const elsewhere = person('u-stranger', 'Wren')
    expect(mentionsIn(`${mentionToken(elsewhere)} hello`, BOARD)).toEqual([])
  })

  it('counts a token and a typed name as two people, and each of them once', () => {
    const board = [...BOARD, JILL]
    const text = `${mentionToken(JILL)} and @Rowan and ${mentionToken(JILL)}`
    expect(mentionsIn(text, board).sort()).toEqual(['u-jill', 'u-rowan'])
  })

  it('does not offer to invite somebody who is already a token', () => {
    expect(unknownMentionIn(`${mentionToken(JILL)} hello`, [JILL])).toBeNull()
  })
})

describe('showing a body that contains a token', () => {
  const JILL = person('u-jill', 'Jill')

  it('reads as the name, never as the token', () => {
    const shown = plainMentionText(`${mentionToken(JILL)} take a look`)
    expect(shown).toBe('@Jill take a look')
    expect(shown).not.toContain('u-jill')
  })

  it('splits into the words and the people', () => {
    expect(mentionSegments(`hi ${mentionToken(JILL)} ok`)).toEqual([
      { kind: 'text', text: 'hi ' },
      { kind: 'mention', userId: 'u-jill', displayName: 'Jill' },
      { kind: 'text', text: ' ok' },
    ])
  })

  it('leaves a body with no mentions in one piece', () => {
    expect(mentionSegments('just words')).toEqual([{ kind: 'text', text: 'just words' }])
  })

  /**
   * `matchAll` copies the pattern, so the shared global regex is safe as
   * written — this holds the NEXT person to `TOKEN.exec()` in a loop, which
   * does carry `lastIndex` between calls and would drop the mention on the
   * second pass through a render.
   */
  it('gives the same answer twice in a row', () => {
    const text = `${mentionToken(JILL)} hello`
    expect(mentionSegments(text)).toEqual(mentionSegments(text))
  })
})

describe('the menu that opens when you type @', () => {
  it('opens on a bare @', () => {
    expect(activeMentionQuery('hello @', 7)).toEqual({ start: 6, query: '' })
  })

  it('carries what has been typed so far', () => {
    expect(activeMentionQuery('hello @Sam', 10)).toEqual({ start: 6, query: 'Sam' })
  })

  /** "Sam Smith" is a name, so a menu that closed on the space could never offer one. */
  it('keeps going across a space, because names have them', () => {
    expect(activeMentionQuery('@Sam Sm', 7)).toEqual({ start: 0, query: 'Sam Sm' })
  })

  /** The cost of allowing spaces: an @ that was never a name must let go. */
  it('gives up once what follows is clearly prose', () => {
    expect(activeMentionQuery(`@${'word '.repeat(12)}`, 61)).toBeNull()
  })

  /**
   * The @ has to OPEN a word. A domain with a dot in it is turned away by the
   * character check instead, so it cannot tell this rule apart from that one
   * — this address is one the menu would otherwise be happy to answer.
   */
  it('stays shut inside an email address', () => {
    expect(activeMentionQuery('write to sam@rowan', 18)).toBeNull()
    expect(activeMentionQuery('write to me@example.com', 23)).toBeNull()
  })

  it('stays shut inside a token that is already written', () => {
    const text = `${mentionToken(person('u-jill', 'Jill'))} hi`
    expect(activeMentionQuery(text, text.length)).toBeNull()
  })

  it('reopens for a second mention after a token', () => {
    const text = `${mentionToken(person('u-jill', 'Jill'))} @Ka`
    expect(activeMentionQuery(text, text.length)?.query).toBe('Ka')
  })

  it('offers everybody before a letter is typed', () => {
    expect(peopleMatching('', BOARD)).toHaveLength(3)
  })

  /**
   * Typing "Sam" must put Sam above Samira, and both above somebody merely
   * containing it. Filtering alone returns them in board order, which is
   * whatever the database felt like.
   */
  it('puts the name that starts with what you typed first', () => {
    const board = [person('u-x', 'Rosamund'), person('u-samira', 'Samira'), person('u-sam', 'Sam')]
    expect(peopleMatching('sam', board).map((p) => p.userId)).toEqual([
      'u-sam',
      'u-samira',
      'u-x',
    ])
  })

  it('offers nobody when nobody matches', () => {
    expect(peopleMatching('zzz', BOARD)).toEqual([])
  })
})

describe('choosing somebody from the menu', () => {
  const JILL = person('u-jill', 'Jill')
  const BOARD_WITH_JILL = [JILL, ...BOARD]

  /**
   * What goes in the box is the NAME.
   *
   * A textarea lays out its whole value even where the glyphs are hidden, so
   * a token in the composer cannot be painted over or concealed — it occupies
   * its full width whatever is drawn on top. The only way a plain textarea
   * shows a name is for the value to be the name.
   */
  it('puts a readable name in the composer, not a token', () => {
    const { text } = insertMention('hey @Ji please look', 7, JILL, BOARD_WITH_JILL)
    expect(text).toBe('hey @Jill please look')
    expect(text).not.toContain('](')
  })

  it('leaves the caret after the name, ready for the next word', () => {
    const { text, caret } = insertMention('hey @Ji', 7, JILL, BOARD_WITH_JILL)
    expect(text.slice(0, caret)).toBe('hey @Jill ')
  })

  /**
   * And the id arrives on the way OUT, so the stored body keeps everything
   * the token was introduced for.
   */
  it('becomes a token when the comment is posted', () => {
    const { text } = insertMention('@Ji', 3, JILL, BOARD_WITH_JILL)
    const sent = tokeniseMentions(text, [JILL], BOARD_WITH_JILL)
    expect(sent.trim()).toBe('@[Jill](u-jill)')
    expect(mentionsIn(sent, BOARD_WITH_JILL)).toEqual(['u-jill'])
  })

  it('survives the person being renamed after the comment was written', () => {
    const { text } = insertMention('@Ji', 3, JILL, BOARD_WITH_JILL)
    const sent = tokeniseMentions(text, [JILL], BOARD_WITH_JILL)
    expect(mentionsIn(sent, [person('u-jill', 'Jill Okonkwo')])).toEqual(['u-jill'])
  })

  /**
   * The shadowing problem, now on the way out as well: "@Sam Smith" ends on a
   * boundary for both names, so the longer has to be taken out of the text
   * before the shorter is looked for.
   */
  it('does not tokenise Sam inside Sam Smith', () => {
    const board = [person('u-sam', 'Sam'), person('u-smith', 'Sam Smith')]
    const sent = tokeniseMentions('@Sam Smith please look', board, board)
    expect(mentionsIn(sent, board)).toEqual(['u-smith'])
  })

  it('leaves a picked name that has since been deleted alone', () => {
    expect(tokeniseMentions('never mind', [JILL], BOARD_WITH_JILL)).toBe('never mind')
  })

  it('does not touch a name that was typed rather than picked', () => {
    const sent = tokeniseMentions('@Rowan what do you think', [], BOARD)
    expect(sent).toBe('@Rowan what do you think')
    // Still reaches him, by the matching that has always been the fallback.
    expect(mentionsIn(sent, BOARD)).toEqual(['u-rowan'])
  })

  /**
   * Two people, one name. Text cannot tell them apart — that ambiguity is the
   * whole reason tokens exist — so this is the one case where the machinery
   * shows in the composer rather than the mention going to whichever of them
   * happens to sort first.
   */
  describe('two people with the same name', () => {
    const board = [person('u-kat-1', 'Kat'), person('u-kat-2', 'Kat')]

    it('writes the token in full, because a name would be a guess', () => {
      const { text } = insertMention('@Ka', 3, board[1]!, board)
      expect(text.trim()).toBe('@[Kat](u-kat-2)')
      expect(mentionsIn(text, board)).toEqual(['u-kat-2'])
    })

    it('and never rewrites the other one over it on the way out', () => {
      const { text } = insertMention('@Ka', 3, board[1]!, board)
      expect(mentionsIn(tokeniseMentions(text, [board[1]!], board), board)).toEqual(['u-kat-2'])
    })
  })

  /**
   * A name with a bracket in it would end the token early and leave the rest
   * of it as visible punctuation in the comment.
   */
  it('survives a name that contains a bracket', () => {
    const awkward = person('u-odd', 'Ali [Ops]')
    const board = [awkward]
    const { text } = insertMention('@Al', 3, awkward, board)
    const sent = tokeniseMentions(text, [awkward], board)
    expect(mentionsIn(sent, board)).toEqual(['u-odd'])
    expect(plainMentionText(sent).trim()).toBe('@Ali Ops')
  })
})
