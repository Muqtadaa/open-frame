import { useEffect, useState } from 'react'

import { useServices, type Identity } from '../runtime/services.js'

/**
 * Who is signed in, or `null` for a guest.
 *
 * `null` is not a loading state and not a failure — it is most people, most of
 * the time, and every consumer renders something sensible for it.
 */
export function useIdentity(): Identity | null {
  return useIdentityState().identity
}

/**
 * The same, plus whether it is the ANSWER yet. The session is restored after
 * the first render, so a signed-in person reads as a guest until it lands —
 * harmless for a label, wrong for anything filed under who they are.
 */
export function useIdentityState(): {
  readonly identity: Identity | null
  readonly settled: boolean
} {
  const { accounts } = useServices()
  const [state, setState] = useState<{ identity: Identity | null; settled: boolean }>(() => ({
    identity: null,
    settled: !accounts.enabled,
  }))

  useEffect(() => {
    if (!accounts.enabled) return
    let live = true

    // The session is restored from storage asynchronously, so the first answer
    // arrives after the first render. Signed out until told otherwise.
    // A lookup that fails is a guest, not a wait that never ends: "not known
    // yet" disables everything filed under a person, voting included.
    accounts.current().then(
      (found) => {
        if (live) setState({ identity: found, settled: true })
      },
      () => {
        if (live) setState({ identity: null, settled: true })
      },
    )

    const stop = accounts.onChange((next) => {
      if (live) setState({ identity: next, settled: true })
    })

    return () => {
      live = false
      stop()
    }
  }, [accounts])

  return state
}
