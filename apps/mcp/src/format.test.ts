import { asBoardId, createEmptyDocument } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { boardList, boardSummary, signedInAs, whoami } from './format.js'
import type { BoardAccess } from './supabase/account.js'

/**
 * The stage's standing guard: nothing this tool prints carries a credential.
 *
 * Written as one test over EVERY formatter rather than an assertion inside
 * each, so a formatter added later has to be added here to be covered — and a
 * formatter that is not here is one nobody checked.
 */
const KEY = '0123456789abcdef0123456789abcdef'

const BOARDS: readonly BoardAccess[] = [
  {
    boardId: asBoardId('brd_abcdefgh12345678'),
    title: 'Pricing research',
    role: 'editor',
    accessKey: KEY,
  },
  {
    boardId: asBoardId('brd_ijklmnop87654321'),
    title: 'Roadmap',
    role: 'viewer',
    accessKey: null,
  },
]

const ACCOUNT = { userId: 'user-1', email: 'someone@example.com', displayName: 'Someone' }

describe('what the tool prints', () => {
  it('never prints a board key', () => {
    const everything = [
      whoami(ACCOUNT),
      whoami(null),
      signedInAs(ACCOUNT),
      boardList(BOARDS),
      boardList([]),
      boardSummary(createEmptyDocument(asBoardId('brd_abcdefgh12345678'), 'Pricing research', 0), 'editor'),
    ].join('\n')

    expect(everything).not.toContain(KEY)
    // Not a prefix of it either: half a key is still a key somebody can
    // finish guessing, and a truncated one in a log is a credential leak that
    // reads like redaction.
    expect(everything).not.toContain(KEY.slice(0, 8))
  })

  it('names each board, what you may do with it, and what it is called', () => {
    const listed = boardList(BOARDS)
    expect(listed).toContain('brd_abcdefgh12345678')
    expect(listed).toContain('editor')
    expect(listed).toContain('Pricing research')
  })

  it('says plainly when there is nobody signed in', () => {
    expect(whoami(null)).toMatch(/not signed in/i)
  })

  it('counts a board by type', () => {
    const board = createEmptyDocument(asBoardId('brd_abcdefgh12345678'), 'Pricing research', 0)
    expect(boardSummary(board, 'viewer')).toContain('0 object(s)')
    expect(boardSummary(board, 'viewer')).toContain('joined as viewer')
  })
})
