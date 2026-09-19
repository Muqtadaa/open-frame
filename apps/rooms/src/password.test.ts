import { describe, expect, it } from 'vitest'

import { isPassword, newVerifier, tokenAdmits, PASSWORD_ITERATIONS } from './password.js'

/** Deterministic bytes, so a salt and a token are predictable in a test. */
function counting(): (into: Uint8Array) => void {
  let next = 0
  return (into) => {
    for (let i = 0; i < into.length; i++) into[i] = next++ % 256
  }
}

describe('a board password', () => {
  it('never stores what was typed', async () => {
    const verifier = await newVerifier('correct horse battery staple')

    expect(JSON.stringify(verifier)).not.toContain('correct horse')
    expect(verifier.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(verifier.salt).toMatch(/^[0-9a-f]{32}$/)
    expect(verifier.token).toMatch(/^[0-9a-f]{32}$/)
    expect(verifier.iterations).toBe(PASSWORD_ITERATIONS)
  })

  it('accepts the password and refuses everything else', async () => {
    const verifier = await newVerifier('open sesame')

    await expect(isPassword(verifier, 'open sesame')).resolves.toBe(true)
    await expect(isPassword(verifier, 'open sesam')).resolves.toBe(false)
    await expect(isPassword(verifier, 'Open Sesame')).resolves.toBe(false)
    await expect(isPassword(verifier, '')).resolves.toBe(false)
  })

  /**
   * The same password twice gives different stored bytes, because the salt
   * differs. Without it, two boards sharing a password share a hash, and one
   * leaked verifier would name every board using that password.
   */
  it('salts, so the same password twice is not the same hash', async () => {
    const one = await newVerifier('same')
    const two = await newVerifier('same')

    expect(one.salt).not.toBe(two.salt)
    expect(one.hash).not.toBe(two.hash)
    expect(one.token).not.toBe(two.token)
  })

  it('is reproducible for a given salt', async () => {
    const one = await newVerifier('same', counting())
    const two = await newVerifier('same', counting())

    expect(one.hash).toBe(two.hash)
  })
})

describe('the token that redeems it', () => {
  it('admits everyone when the board has no password', () => {
    expect(tokenAdmits(undefined, null)).toBe(true)
    expect(tokenAdmits(undefined, 'anything')).toBe(true)
  })

  it('admits only the current token when it does', async () => {
    const verifier = await newVerifier('open sesame')

    expect(tokenAdmits(verifier, verifier.token)).toBe(true)
    expect(tokenAdmits(verifier, null)).toBe(false)
    expect(tokenAdmits(verifier, 'f'.repeat(32))).toBe(false)
    // A prefix must not pass. `sameSecret` compares lengths first for exactly
    // this, and a truncating comparison would make the token 4 bits of work.
    expect(tokenAdmits(verifier, verifier.token.slice(0, 8))).toBe(false)
  })

  /**
   * THE WHOLE POINT of setting a password on a link already sent. Changing it
   * mints a new token, so every browser still holding the old one is shut out.
   */
  it('stops admitting the old token once the password changes', async () => {
    const before = await newVerifier('first')
    const after = await newVerifier('second')

    expect(tokenAdmits(after, before.token)).toBe(false)
    expect(tokenAdmits(after, after.token)).toBe(true)
  })
})
