/**
 * A board's optional password, and the one token that redeems it.
 *
 * Pure enough to test: everything here is values in, values out, using only
 * `crypto.subtle`, which exists in Workers, in Node and in the browser alike.
 * The reasoning in `access.ts` applies with more force here — this is the most
 * security-relevant code in the repository and a guard that can only be run by
 * deploying is a guard nobody runs.
 */

/** What the room stores. Never the password itself. */
export interface PasswordVerifier {
  readonly salt: string
  readonly hash: string
  readonly iterations: number
  /**
   * The one token that opens this board, minted with the password and replaced
   * whenever it changes.
   *
   * ONE token for everybody rather than one per person, which is not a
   * shortcut: a shared password cannot distinguish the people who know it, so
   * per-person tokens would be per-person only in appearance. What this buys
   * is the property that matters — setting, changing or clearing the password
   * mints a new token and every browser holding the old one is shut out at
   * once, which is the entire reason to add a password to a link that has
   * already been sent somewhere it should not have gone.
   */
  readonly token: string
}

/**
 * PBKDF2-SHA-256, at a count chosen for where it runs.
 *
 * OWASP asks for 600,000 for a password that protects an account. This is not
 * that: it is a second factor on a link that is itself a 128-bit secret, and
 * it runs inside a Durable Object on a request a person is waiting on. 100,000
 * is about 60ms of CPU there — slow enough that guessing at scale is a real
 * expense, fast enough that unlocking a board does not feel broken.
 *
 * Stored ALONGSIDE the hash rather than read from here, so raising it later
 * does not invalidate every password already set.
 */
export const PASSWORD_ITERATIONS = 100_000

const encoder = new TextEncoder()

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomHex(bytes: number, random: (into: Uint8Array) => void): string {
  const into = new Uint8Array(bytes)
  random(into)
  return [...into].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function derive(password: string, salt: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations, hash: 'SHA-256' },
    key,
    256,
  )
  return toHex(bits)
}

/**
 * Compared in constant time.
 *
 * `roleForKey` argues — correctly — that a timing channel on a 128-bit secret
 * across the internet is unreachable. A password is the one thing here that
 * argument does not cover: people choose them, they are not 128 bits of
 * entropy, and the comparison runs against a value the guesser controls. It
 * costs three lines to not have to make the argument at all.
 */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return difference === 0
}

/** A verifier for a new password, with a fresh salt and a fresh token. */
export async function newVerifier(
  password: string,
  random: (into: Uint8Array) => void = crypto.getRandomValues.bind(crypto),
): Promise<PasswordVerifier> {
  const salt = randomHex(16, random)
  return {
    salt,
    hash: await derive(password, salt, PASSWORD_ITERATIONS),
    iterations: PASSWORD_ITERATIONS,
    token: randomHex(16, random),
  }
}

/** Whether this is the board's password. */
export async function isPassword(
  verifier: PasswordVerifier,
  password: string,
): Promise<boolean> {
  const attempt = await derive(password, verifier.salt, verifier.iterations)
  return sameSecret(attempt, verifier.hash)
}

/**
 * Whether a connection carrying this token may proceed.
 *
 * A board with no password admits everyone the LINK admits — this adds a
 * factor, it never replaces the key check that `roleForKey` does.
 */
export function tokenAdmits(verifier: PasswordVerifier | undefined, token: string | null): boolean {
  if (verifier === undefined) return true
  if (token === null) return false
  return sameSecret(token, verifier.token)
}
