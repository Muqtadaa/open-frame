import type { SupabaseClient } from '@supabase/supabase-js'

import { SUPABASE_KEY, SUPABASE_URL } from './config.js'

/**
 * The one Supabase client, built once or not at all.
 *
 * Lazy because a build with no identity service must not construct one: the
 * client starts a session-refresh timer and reads storage the moment it exists,
 * and a board that works with no account should do nothing of the kind.
 *
 * And loaded lazily, not only built lazily: the library was about 209KB of a
 * 999KB entry chunk, downloaded and parsed by every page — a local board and a
 * signed-out front door included — whether or not anything asked for it
 * (audit 2026-09-27). It is imported the first time something does.
 */
let client: Promise<SupabaseClient | null> | null = null

export function supabaseClient(): Promise<SupabaseClient | null> {
  if (SUPABASE_URL === null || SUPABASE_KEY === null) return Promise.resolve(null)
  const url = SUPABASE_URL
  const key = SUPABASE_KEY
  client ??= import('@supabase/supabase-js').then(({ createClient }) => {
    const built = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        /*
         * The session lands in the URL after an email link or an OAuth
         * redirect, and is cleaned out of it once read. Left there it ends up
         * in history, in a shared screenshot, and in the referrer of the next
         * request.
         */
        detectSessionInUrl: true,
      },
    })
    for (const ready of whenBuilt) ready(built)
    whenBuilt.clear()
    return built
  })
  return client
}

/*
 * Whoever wants to know when the client exists, for listeners subscribed
 * before anything had a reason to build it.
 */
const whenBuilt = new Set<(client: SupabaseClient) => void>()

/** Calls `ready` with the client once it has been built, by whatever built it. */
export function onClientBuilt(ready: (client: SupabaseClient) => void): () => void {
  if (client !== null) {
    void client.then((built) => {
      if (built !== null) ready(built)
    })
    return () => undefined
  }
  whenBuilt.add(ready)
  return () => {
    whenBuilt.delete(ready)
  }
}

/**
 * Whether there could be a session to read, without loading the library to
 * find out.
 *
 * Asking "who is signed in?" is what every page does first, and it was what
 * loaded the library on a signed-out front door and on every local board. A
 * browser that has never signed in has no stored session, and a sign-in link
 * that has just landed carries its token in the URL: in either case there is
 * something to read, and otherwise there cannot be.
 */
export function sessionPossible(): boolean {
  if (client !== null) return true
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key !== null && /^sb-.+-auth-token$/.test(key)) return true
    }
  } catch {
    // Storage refused: find out the long way.
    return true
  }
  const { hash, search } = window.location
  return /access_token|refresh_token|error_description/.test(hash) || /[?&]code=/.test(search)
}
