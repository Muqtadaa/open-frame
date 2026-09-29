/**
 * Whether this build has an identity service, and where it is.
 *
 * Both values are PUBLISHABLE. They ship inside the JavaScript bundle by
 * design, and everything that actually protects anything is a row-level
 * security policy on the database rather than a secret held here — which is why
 * there is no service-role key anywhere in this repository and must never be.
 *
 * Absent means this build has no accounts. Not broken accounts: the board works
 * exactly as it does today, which is PRODUCT.md's fourth principle and the
 * reason the whole thing degrades to guests rather than to an error.
 */
const URL_CONFIGURED = import.meta.env.VITE_SUPABASE_URL
const KEY_CONFIGURED = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const SUPABASE_URL: string | null =
  typeof URL_CONFIGURED === 'string' && URL_CONFIGURED.length > 0
    ? URL_CONFIGURED.replace(/\/+$/, '')
    : null

export const SUPABASE_KEY: string | null =
  typeof KEY_CONFIGURED === 'string' && KEY_CONFIGURED.length > 0 ? KEY_CONFIGURED : null

export const ACCOUNTS_ENABLED = SUPABASE_URL !== null && SUPABASE_KEY !== null
