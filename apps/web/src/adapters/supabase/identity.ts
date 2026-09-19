import type { Session } from '@supabase/supabase-js'

import { supabaseClient } from './client.js'

/**
 * Who you are, if you are anybody.
 *
 * The only module that talks to the auth service. Everything downstream gets an
 * `Identity` — a name, a hue and an access token — and cannot tell which
 * provider issued it, which is what makes the provider replaceable and what the
 * `supabase-lives-only-in-adapters` rule enforces mechanically.
 *
 * Signed out is a FIRST-CLASS state, not a failure. A board works in one
 * browser with no account and no network (PRODUCT.md, principle four), so
 * everything here is allowed to answer "nobody" and the app carries on.
 */

export interface Identity {
  readonly userId: string
  readonly email: string | null
  readonly displayName: string
  /** An index into the presence palette, never a colour. */
  readonly hue: number
  /**
   * The current access token, for the room to check.
   *
   * Read fresh rather than stored: it is refreshed on a timer, and a copy kept
   * in a component is a token that expires while the tab is open.
   */
  readonly accessToken: string
}

export interface AuthResult {
  readonly ok: boolean
  /** Written for the person who hit it, not copied from the provider. */
  readonly message?: string
}

const PROFILE_COLUMNS = 'display_name, hue'

async function identityFrom(session: Session): Promise<Identity> {
  const client = supabaseClient()
  const fallbackName = session.user.email?.split('@')[0] ?? 'Someone'

  let displayName = fallbackName
  let hue = 0

  if (client !== null) {
    const { data } = await client
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', session.user.id)
      .maybeSingle()

    /*
     * A missing profile is not an error. The trigger creates one for every new
     * user, but a row can be absent for a few milliseconds after sign-up, and
     * failing the whole sign-in over a display name would be absurd.
     */
    const row = data as { display_name?: unknown; hue?: unknown } | null
    if (typeof row?.display_name === 'string' && row.display_name.length > 0) {
      displayName = row.display_name
    }
    if (typeof row?.hue === 'number' && Number.isInteger(row.hue)) hue = row.hue
  }

  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    displayName,
    hue,
    accessToken: session.access_token,
  }
}

/** The identity right now, or `null` for a guest. */
export async function currentIdentity(): Promise<Identity | null> {
  const client = supabaseClient()
  if (client === null) return null
  const { data } = await client.auth.getSession()
  return data.session === null ? null : identityFrom(data.session)
}

/**
 * Called whenever the answer changes — signing in, signing out, and every token
 * refresh, because the token is part of the identity.
 */
export function onIdentityChange(listener: (identity: Identity | null) => void): () => void {
  const client = supabaseClient()
  if (client === null) return () => undefined

  const { data } = client.auth.onAuthStateChange((_event, session) => {
    if (session === null) {
      listener(null)
      return
    }
    void identityFrom(session).then(listener)
  })
  return () => {
    data.subscription.unsubscribe()
  }
}

/**
 * Messages a person can act on.
 *
 * The provider's own wording leaks its implementation ("Invalid login
 * credentials", "User already registered") and, in the sign-in case, tells an
 * attacker whether an address has an account. One message covers both halves of
 * a wrong sign-in for that reason.
 */
export function readableError(message: string): string {
  const text = message.toLowerCase()

  /*
   * A network failure first, and it earns its place at the top: the fallback
   * used to answer "something went wrong signing in" when the service could
   * not be reached at all, which sends somebody to check a password that was
   * never the problem. Found by running against a sandbox that cannot reach
   * Supabase — the message was wrong in exactly the way a train tunnel or a
   * blocked corporate proxy would make it wrong.
   */
  if (text.includes('failed to fetch') || text.includes('networkerror') || text.includes('fetch')) {
    return 'Could not reach the sign-in service. Check your connection and try again.'
  }

  if (text.includes('invalid login')) return 'That email and password do not match an account.'
  if (text.includes('already registered')) return 'There is already an account with that email.'
  if (text.includes('password')) return 'That password is too short — use at least six characters.'
  if (text.includes('email')) return 'That does not look like an email address.'
  return 'Something went wrong signing in. Try again in a moment.'
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const client = supabaseClient()
  if (client === null) return { ok: false, message: 'This build has no accounts.' }

  const { error } = await client.auth.signInWithPassword({ email, password })
  return error === null ? { ok: true } : { ok: false, message: readableError(error.message) }
}

export async function signUp(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthResult> {
  const client = supabaseClient()
  if (client === null) return { ok: false, message: 'This build has no accounts.' }

  const { error } = await client.auth.signUp({
    email,
    password,
    // Read by the database trigger that creates the profile, so the name is
    // right from the first render rather than after an update.
    options: { data: { display_name: displayName.trim() } },
  })
  return error === null ? { ok: true } : { ok: false, message: readableError(error.message) }
}

export async function signOut(): Promise<void> {
  await supabaseClient()?.auth.signOut()
}
