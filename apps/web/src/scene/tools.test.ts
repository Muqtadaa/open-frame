import { describe, expect, it } from 'vitest'

import { makeFor, type DeclaredTool } from './tools.js'

const poll: DeclaredTool = {
  type: 'poll',
  tool: {
    label: 'Poll',
    keys: ['p'],
    order: 1,
    place: 'click',
    needsMaker: true,
    data: (_options, maker) => ({ by: maker.me }),
    cursor: () => ({ body: '' }),
  },
}

describe('makeFor', () => {
  const me = { key: 'u_0123456789abcdef', name: 'Ada', hue: 120 }

  it('hands the maker to the type that keeps it', () => {
    expect(makeFor('poll', [poll], {}, { me })?.data).toEqual({ by: me })
  })

  /*
   * Until the account has loaded, nobody is known. A poll placed then was
   * kept as asked by nobody, which anyone may close (Codex, on #92): it waits.
   */
  it('makes nothing that keeps its maker while nobody is known', () => {
    expect(makeFor('poll', [poll], {}, { me: null })).toBeNull()
  })
})
