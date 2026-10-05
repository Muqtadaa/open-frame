import type { Verified } from './handler.js'

/**
 * Who a Supabase access token belongs to, asked of Supabase itself.
 *
 * Asked rather than verified locally: it needs no JWT library and no signing
 * secret in the worker, works whichever key type the project uses, and a
 * token that has been signed out is refused at once rather than when it
 * expires. It costs one round trip, after every check that costs nothing.
 */
export function verifyWithSupabase(options: {
  readonly url: string
  readonly publishableKey: string
  readonly fetch: typeof globalThis.fetch
}): (token: string) => Promise<Verified> {
  return async (token) => {
    let response: Response
    try {
      response = await options.fetch(`${options.url.replace(/\/$/, '')}/auth/v1/user`, {
        headers: { apikey: options.publishableKey, authorization: `Bearer ${token}` },
      })
    } catch {
      return 'unreachable'
    }
    if (response.status === 401 || response.status === 403) return 'refused'
    if (!response.ok) return 'unreachable'
    try {
      const user = await response.json<{ id?: unknown }>()
      return typeof user.id === 'string' && user.id !== '' ? { userId: user.id } : 'refused'
    } catch {
      return 'unreachable'
    }
  }
}
