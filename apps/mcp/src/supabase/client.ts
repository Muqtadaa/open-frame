import { createClient } from '@supabase/supabase-js'

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../project.js'

/**
 * The identity service, from a process with no browser in it.
 *
 * The one place `apps/mcp` names Supabase, for the reason the web app has one
 * too: a tool that imported a database client is a tool that cannot be tested
 * without one, and everything downstream takes a session rather than a client.
 *
 * `persistSession: false` because this process owns where the session is kept
 * — a file with `0600` on it — and a library writing a second copy somewhere
 * of its choosing is a credential nobody is watching. The refresh still
 * happens in memory, and rotation is written back by the account module.
 */
export function createAuthClient() {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      // There is no URL to detect a session in. Left on, the client looks for
      // `window.location` on every start.
      detectSessionInUrl: false,
    },
  })
}

/**
 * The client's type, named here so nothing else has to import the library to
 * hold one — which is also what keeps `supabase-lives-only-in-adapters` true
 * of the module that does the work.
 */
export type AuthClient = ReturnType<typeof createAuthClient>
