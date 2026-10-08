import { useSyncExternalStore } from 'react'

import { useServices, type AccountService, type Identity } from '../runtime/services.js'

interface IdentityState {
  readonly identity: Identity | null
  readonly settled: boolean
}

interface IdentityStore {
  readonly subscribe: (listener: () => void) => () => void
  readonly read: () => IdentityState
}

/*
 * One answer for the page, per account service. Every mark on a note asks who
 * "me" is, and each used to ask the service itself: a lookup and a
 * subscription apiece, each a profile query, and again for every note that
 * culling remounted on a pan — about 150 requests to open a board with 60
 * voted notes on screen (audit 2026-10-08). The first to ask starts the one
 * lookup and the one subscription; they last as long as the page, because a
 * board that pans would otherwise stop and start them all the time.
 */
const stores = new WeakMap<AccountService, IdentityStore>()

function storeFor(accounts: AccountService): IdentityStore {
  const known = stores.get(accounts)
  if (known !== undefined) return known

  let state: IdentityState = { identity: null, settled: !accounts.enabled }
  const listeners = new Set<() => void>()
  let started = false
  const set = (next: IdentityState): void => {
    state = next
    for (const listener of listeners) listener()
  }
  const start = (): void => {
    if (started || !accounts.enabled) return
    started = true
    // The session is restored from storage asynchronously, so the first answer
    // arrives after the first render. Signed out until told otherwise.
    // A lookup that fails is a guest, not a wait that never ends: "not known
    // yet" disables everything filed under a person, voting included.
    accounts.current().then(
      (found) => {
        // A change heard while the lookup was out is newer than its answer.
        if (!state.settled) set({ identity: found, settled: true })
      },
      () => {
        if (!state.settled) set({ identity: null, settled: true })
      },
    )
    accounts.onChange((next) => {
      set({ identity: next, settled: true })
    })
  }

  const store: IdentityStore = {
    subscribe: (listener) => {
      listeners.add(listener)
      start()
      return () => {
        listeners.delete(listener)
      }
    },
    read: () => state,
  }
  stores.set(accounts, store)
  return store
}

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
export function useIdentityState(): IdentityState {
  const store = storeFor(useServices().accounts)
  return useSyncExternalStore(store.subscribe, store.read)
}
