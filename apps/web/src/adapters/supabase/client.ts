import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { SUPABASE_KEY, SUPABASE_URL } from '../../app/supabase-config.js'

/**
 * The one Supabase client, built once or not at all.
 *
 * Lazy because a build with no identity service must not construct one: the
 * client starts a session-refresh timer and reads storage the moment it exists,
 * and a board that works with no account should do nothing of the kind.
 */
let client: SupabaseClient | null = null

export function supabaseClient(): SupabaseClient | null {
  if (SUPABASE_URL === null || SUPABASE_KEY === null) return null
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      /*
       * The session lands in the URL after an email link or an OAuth redirect,
       * and is cleaned out of it once read. Left there it ends up in history,
       * in a shared screenshot, and in the referrer of the next request.
       */
      detectSessionInUrl: true,
    },
  })
  return client
}
