import { describe, expect, it } from 'vitest'

import { readableError } from './identity.js'

/**
 * The messages a person is actually shown.
 *
 * Worth testing because the first version got the most important one wrong: a
 * network failure fell through to "something went wrong signing in", which
 * sends somebody to check a password that was never the problem. It surfaced
 * by running the app somewhere that could not reach the service at all —
 * exactly what a train tunnel or a blocked corporate proxy looks like.
 */
describe('turning a provider error into something a person can act on', () => {
  it.each([
    ['TypeError: Failed to fetch'],
    ['NetworkError when attempting to fetch resource.'],
  ])('says the service is unreachable for %s', (raw) => {
    expect(readableError(raw)).toContain('Could not reach')
  })

  /**
   * One message for both halves of a wrong sign-in. Saying "no account with
   * that email" tells anyone who asks which addresses are registered.
   */
  it('does not reveal whether an email has an account', () => {
    const message = readableError('Invalid login credentials')
    expect(message).toBe('That email and password do not match an account.')
    expect(message.toLowerCase()).not.toContain('no account')
  })

  it('names the fixable problems', () => {
    expect(readableError('User already registered')).toContain('already an account')
    expect(readableError('Password should be at least 6 characters')).toContain('six characters')
  })

  /** Never the provider's own words: they leak its implementation. */
  it('falls back to something plain rather than passing the raw text through', () => {
    const raw = 'AuthApiError: unexpected_failure in gotrue v2.170.0'
    expect(readableError(raw)).not.toContain('gotrue')
    expect(readableError(raw)).toBe('Something went wrong signing in. Try again in a moment.')
  })
})
