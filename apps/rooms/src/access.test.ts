import { describe, expect, it } from 'vitest'

import {
  claimDecision,
  mintKey,
  mintKeys,
  roleForKey,
  roleFromAttachment,
  type AccessKeys,
} from './access.js'

/**
 * The authorization decisions, run in Node.
 *
 * This is the most security-relevant code in the repository, and until it was
 * pulled out of the Durable Object it could only have been exercised by
 * deploying — which ADR 0013 says, about every other seam in this app, means
 * not exercised at all.
 */

const keys: AccessKeys = { editor: 'e'.repeat(32), viewer: 'v'.repeat(32) }

describe('a claimed board', () => {
  it('lets the edit link edit', () => {
    expect(roleForKey(keys, keys.editor)).toBe('editor')
  })

  it('lets the view link watch', () => {
    expect(roleForKey(keys, keys.viewer)).toBe('viewer')
  })

  it('opens for nothing else', () => {
    expect(roleForKey(keys, 'x'.repeat(32))).toBeNull()
    expect(roleForKey(keys, '')).toBeNull()
  })

  /**
   * The board id alone stops being enough the moment a board is claimed. That
   * is the entire difference between a view-only link and a suggestion: if the
   * id still admitted anyone, a viewer could simply drop the key.
   */
  it('is not opened by knowing the board id alone', () => {
    expect(roleForKey(keys, null)).toBeNull()
  })
})

describe('a board shared before links had roles', () => {
  /**
   * Every link already in circulation is one of these. Refusing them would
   * break them; demoting their holders to viewers would be worse, because
   * nothing would look broken — people would just find their edits gone.
   */
  it('stays exactly as open as it was', () => {
    expect(roleForKey(undefined, null)).toBe('editor')
    expect(roleForKey(undefined, 'anything')).toBe('editor')
  })
})

describe('claiming', () => {
  it('mints links for a board that is new and empty', () => {
    expect(claimDecision(undefined, false)).toEqual({ ok: true })
  })

  /** Twice would rotate the links out from under everyone already holding them. */
  it('refuses a board that already has links', () => {
    const decision = claimDecision(keys, false)
    expect(decision.ok).toBe(false)
    if (decision.ok) return
    expect(decision.status).toBe(409)
  })

  /**
   * The takeover guard. Without it, anyone holding a legacy link could claim
   * that room and lock out the person whose board it is.
   */
  it('refuses a board that already has content', () => {
    const decision = claimDecision(undefined, true)
    expect(decision.ok).toBe(false)
    if (decision.ok) return
    expect(decision.status).toBe(409)
    expect(decision.error).toContain('shared before links had roles')
  })
})

describe('the keys themselves', () => {
  it('are two different secrets', () => {
    const minted = mintKeys()
    expect(minted.editor).not.toBe(minted.viewer)
  })

  it('are long enough that the link is the credential', () => {
    // 16 random bytes as hex. The link is all that protects the board, so the
    // length here is the security parameter, not a formatting choice.
    expect(mintKey()).toMatch(/^[0-9a-f]{32}$/)
  })

  it('do not repeat', () => {
    const seen = new Set(Array.from({ length: 500 }, () => mintKey()))
    expect(seen.size).toBe(500)
  })

  /**
   * A generator that returned the same bytes every time would pass every test
   * above except the two before this one — so this checks the mapping from
   * bytes to key, independent of the source of randomness.
   */
  it('carry every byte they were given', () => {
    const fixed = (bytes: Uint8Array): void => {
      bytes.set([0, 1, 15, 16, 127, 128, 254, 255, 0, 0, 0, 0, 0, 0, 0, 0])
    }
    expect(mintKey(fixed)).toBe('00010f107f80feff0000000000000000')
  })
})

describe('the role on a socket that outlived its room', () => {
  it('is what was decided when the connection was accepted', () => {
    expect(roleFromAttachment({ role: 'editor' })).toBe('editor')
    expect(roleFromAttachment({ role: 'viewer' })).toBe('viewer')
  })

  /**
   * A socket accepted by a future version, re-read after an eviction by this
   * one. The safe direction for a value we cannot interpret is the one that
   * grants nothing.
   */
  it('is a viewer for anything this version cannot read', () => {
    expect(roleFromAttachment(null)).toBe('viewer')
    expect(roleFromAttachment({})).toBe('viewer')
    expect(roleFromAttachment({ role: 'owner' })).toBe('viewer')
    expect(roleFromAttachment({ role: 7 })).toBe('viewer')
  })
})
