import { afterEach, describe, expect, it, vi } from 'vitest'

import { forgetGuestForTests, guestIdentity } from './guest.js'

/**
 * A guest is one person for the whole page, whether or not the browser lets
 * the page remember them.
 */
describe('a guest', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    forgetGuestForTests()
    localStorage.clear()
  })

  /*
   * With storage blocked every call invented someone new, and the reaction bar
   * and the chips each ask: the bar added a reaction as one guest and the chip
   * beside it, asking as another, could never take it back.
   */
  it('stays the same person when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const first = guestIdentity()
    expect(guestIdentity()).toEqual(first)
  })

  it('is remembered across page loads when storage works', () => {
    const first = guestIdentity()
    forgetGuestForTests()
    expect(guestIdentity()).toEqual(first)
  })
})
