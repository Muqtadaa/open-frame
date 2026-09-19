import { describe, expect, it } from 'vitest'

import { createBoardCapabilities } from './board-capabilities.js'

/**
 * What the interface offers, before and after the room answers.
 *
 * This is the UX half of view-only. The room is what actually refuses a
 * viewer's writes; this is what stops the interface inviting one.
 */

describe('a board that has not heard from the room yet', () => {
  /**
   * Optimistic on purpose. Starting locked would flicker a disabled toolbar at
   * everybody on every load, to cover a window in which the room is already
   * refusing the writes anyway.
   */
  it('offers everything', () => {
    const capabilities = createBoardCapabilities()

    expect(capabilities.can('edit', 'board_x' as never)).toBe(true)
    expect(capabilities.readOnly()).toBe(false)
  })
})

describe('once the room says viewer', () => {
  it('stops offering edits but keeps offering the board', () => {
    const capabilities = createBoardCapabilities()

    capabilities.narrowTo('viewer')

    expect(capabilities.can('edit', 'board_x' as never)).toBe(false)
    expect(capabilities.can('manage', 'board_x' as never)).toBe(false)
    expect(capabilities.can('own', 'board_x' as never)).toBe(false)
    // `view` is what lets merged changes through the dispatcher. A viewer that
    // lost this would sit watching a board frozen at the moment they joined.
    expect(capabilities.can('view', 'board_x' as never)).toBe(true)
    expect(capabilities.can('comment', 'board_x' as never)).toBe(true)
    expect(capabilities.readOnly()).toBe(true)
  })

  /**
   * One-way. A room that said `editor` after saying `viewer` would be
   * contradicting itself, and the safe reading of a contradiction is the one
   * that grants less — a reconnect must not quietly hand somebody the pen.
   */
  it('does not give the edit back', () => {
    const capabilities = createBoardCapabilities()

    capabilities.narrowTo('viewer')
    capabilities.narrowTo('editor')

    expect(capabilities.can('edit', 'board_x' as never)).toBe(false)
    expect(capabilities.readOnly()).toBe(true)
  })
})

describe('once the room says editor', () => {
  it('changes nothing, because that is where it started', () => {
    const capabilities = createBoardCapabilities()

    capabilities.narrowTo('editor')

    expect(capabilities.can('edit', 'board_x' as never)).toBe(true)
    expect(capabilities.readOnly()).toBe(false)
  })
})
