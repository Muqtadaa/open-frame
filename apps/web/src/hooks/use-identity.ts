import { useEffect, useState } from 'react'

import { ACCOUNTS_ENABLED, currentIdentity, onIdentityChange, type Identity } from '../app/identity.js'

/**
 * Who is signed in, or `null` for a guest.
 *
 * `null` is not a loading state and not a failure — it is most people, most of
 * the time, and every consumer renders something sensible for it.
 */
export function useIdentity(): Identity | null {
  const [identity, setIdentity] = useState<Identity | null>(null)

  useEffect(() => {
    if (!ACCOUNTS_ENABLED) return
    let live = true

    // The session is restored from storage asynchronously, so the first answer
    // arrives after the first render. Signed out until told otherwise.
    void currentIdentity().then((found) => {
      if (live) setIdentity(found)
    })

    const stop = onIdentityChange((next) => {
      if (live) setIdentity(next)
    })

    return () => {
      live = false
      stop()
    }
  }, [])

  return identity
}
