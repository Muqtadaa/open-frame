import { useCallback, useSyncExternalStore } from 'react'

import { useOpenFrame } from '../runtime/context.js'
import type { AssetUrlLookup } from '../views/registry.js'

const NEVER_CHANGES = (): (() => void) => () => undefined

/**
 * A synchronous asset-URL lookup that re-renders when a load lands.
 *
 * `enabled` comes from the view's `usesAssets` flag. A disabled call still runs
 * every hook — it just subscribes to nothing — which keeps the hook order fixed
 * while leaving the listener set proportional to the number of images on the
 * board rather than the number of objects.
 */
export function useAssetUrl(enabled: boolean): AssetUrlLookup {
  const { runtime } = useOpenFrame()
  const assets = runtime.assets

  const subscribe = useCallback(
    (onChange: () => void) => (enabled ? assets.subscribe(onChange) : NEVER_CHANGES()),
    [assets, enabled],
  )
  /*
   * Subscribed for the re-render alone — the value is deliberately unused.
   *
   * The snapshot is a COUNTER rather than the URL map: `useSyncExternalStore`
   * compares snapshots with `Object.is`, so returning a freshly built object
   * would re-render forever (the same trap as rule 9's Zustand selectors).
   */
  useSyncExternalStore(
    subscribe,
    () => (enabled ? assets.version : 0),
    () => 0,
  )

  // Not memoized: it reads through to the service on every call, so a stale
  // identity could never hand back a stale URL, and nothing downstream
  // memoizes on it.
  return (ref) => {
    const url = assets.urlFor(ref)
    if (url !== undefined) return { status: 'ready', url }
    return assets.isMissing(ref) ? { status: 'missing' } : { status: 'loading' }
  }
}
