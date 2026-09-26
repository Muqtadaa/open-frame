import { describe, expect, it } from 'vitest'

import { draftIsBy, draftKey } from './comment-drafts.js'

/*
 * A draft belongs to the account that wrote it. The store outlives a sign-out,
 * so a key that named only the thread handed the next account on the same page
 * the last one's unfinished words.
 */
describe('comment draft keys', () => {
  const spot = { x: 10, y: 20, objectId: null, on: null }

  it('differ between two accounts for the same thread and the same spot', () => {
    expect(draftKey('alice', 'cmt_1', null)).not.toBe(draftKey('bob', 'cmt_1', null))
    expect(draftKey('alice', null, spot)).not.toBe(draftKey('bob', null, spot))
  })

  it('belong only to the account that made them', () => {
    const key = draftKey('alice', null, spot) ?? ''
    expect(draftIsBy(key, 'alice')).toBe(true)
    expect(draftIsBy(key, 'bob')).toBe(false)
    expect(draftIsBy(key, null)).toBe(false)
  })

  it('are nobody’s without an account', () => {
    expect(draftKey(null, 'cmt_1', null)).toBeNull()
  })
})
