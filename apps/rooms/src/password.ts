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
export async function isPassword(verifier: PasswordVerifier, password: string): Promise<boolean> {
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

/**
 * How many wrong passwords this board has seen lately, and until when it
 * refuses to look at another.
 *
 * ONE per board, not per person: the room cannot tell the people holding a
 * link apart, and anybody who can guess can also change their address. The
 * cost is that somebody hammering a board makes everyone else wait too — for
 * at most `MAX_UNLOCK_COOLDOWN_MS`, never for good, and never its owner, whose
 * key skips the password altogether.
 */
export interface UnlockThrottle {
  readonly failures: number
  readonly lastFailureAt: number
  readonly blockedUntil: number
}

/** Wrong guesses that cost nothing. A typo, or three, is ordinary. */
export const FREE_UNLOCK_ATTEMPTS = 5
/** The first wait once those are spent; it doubles from there. */
export const FIRST_UNLOCK_COOLDOWN_MS = 1_000
/**
 * The longest anybody is ever made to wait. A permanent lockout would hand
 * anybody holding the URL a way to shut everyone else out of the board.
 */
export const MAX_UNLOCK_COOLDOWN_MS = 5 * 60_000
/** A quiet spell this long and the failures before it are forgotten. */
export const UNLOCK_FAILURES_FORGOTTEN_AFTER_MS = 15 * 60_000

export type UnlockAllowed =
  { readonly ok: true } | { readonly ok: false; readonly retryAfterSeconds: number }

/**
 * Whether a password may be checked at all right now.
 *
 * Asked BEFORE the hash is derived, so a refused attempt costs the room
 * nothing either. The wait is rounded UP, so `Retry-After` never says 0 while
 * the answer is still no.
 */
export function unlockAllowed(state: UnlockThrottle | undefined, now: number): UnlockAllowed {
  if (state === undefined || now >= state.blockedUntil) return { ok: true }
  return { ok: false, retryAfterSeconds: Math.ceil((state.blockedUntil - now) / 1000) }
}

/** The throttle after one more wrong password. A right one clears it instead. */
export function afterFailedUnlock(state: UnlockThrottle | undefined, now: number): UnlockThrottle {
  const forgotten =
    state === undefined || now - state.lastFailureAt >= UNLOCK_FAILURES_FORGOTTEN_AFTER_MS
  const failures = (forgotten ? 0 : state.failures) + 1
  const over = failures - FREE_UNLOCK_ATTEMPTS
  const cooldown =
    over <= 0 ? 0 : Math.min(FIRST_UNLOCK_COOLDOWN_MS * 2 ** (over - 1), MAX_UNLOCK_COOLDOWN_MS)
  return { failures, lastFailureAt: now, blockedUntil: now + cooldown }
}
