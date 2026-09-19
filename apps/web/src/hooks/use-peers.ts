import { useEffect, useMemo, useState } from 'react'

import { useOpenFrame } from '../runtime/context.js'
import { editorsByObject, readPresence, type Peer } from '../scene/presence.js'

const NOBODY: readonly Peer[] = []

/**
 * Everyone else in the room, narrowed and ready to draw.
 *
 * Empty for a board that is nobody else's, which is most boards — so every
 * consumer of this renders nothing without needing to know whether
 * collaboration exists at all.
 */
export function usePeers(): readonly Peer[] {
  const { collaboration } = useOpenFrame()
  const [peers, setPeers] = useState<readonly Peer[]>(NOBODY)

  useEffect(() => {
    if (collaboration === null || collaboration === undefined) return
    return collaboration.onPeers((raw) => {
      const next: Peer[] = []
      for (const entry of raw) {
        const state = readPresence(entry.state)
        if (state !== null) next.push({ clientId: entry.clientId, ...state })
      }
      // Stable order, so a chip does not jump along the row when somebody
      // moves their mouse.
      next.sort((a, b) => a.clientId - b.clientId)
      setPeers(next)
    })
  }, [collaboration])

  // Returned rather than pushed through state when there is no room: setting
  // state from inside an effect just to say "still empty" is a render nobody
  // asked for, and React now warns about it.
  return collaboration === null || collaboration === undefined ? NOBODY : peers
}

/** Which objects are held open by somebody else, for the advisory lock. */
export function useLockedByOthers(peers: readonly Peer[]): ReadonlySet<ObjectIdLike> {
  return useMemo(() => new Set(editorsByObject(peers).keys()), [peers])
}

type ObjectIdLike = ReturnType<typeof editorsByObject> extends ReadonlyMap<infer K, unknown>
  ? K
  : never
