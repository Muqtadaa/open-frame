import { useEffect, useMemo, useRef } from 'react'

import { discussionSignature } from '../scene/presence.js'
import { usePeers } from './use-peers.js'

/**
 * Re-reads the discussion when somebody else changes it.
 *
 * Comments are NOT in the CRDT — a remark in the document would be in undo, in
 * export, in search and in the registry, and deleting the element it was
 * dropped on would delete the discussion about that element. So they cannot
 * ride the board's own updates, and something else has to say when to look.
 *
 * That something is presence: a peer who posts raises a counter, and the
 * signature over those counters changes. This client then re-reads from the
 * database, which stays the one source of truth about what was said. The
 * WIRE carries a nudge, never the comment — two clients therefore cannot
 * disagree about what is on the board, whatever order the nudges arrive in.
 *
 * The first signature is recorded rather than acted on. Mounting is already a
 * read; treating the peers that were there all along as news would make every
 * board opening two.
 */
export function useLiveComments(enabled: boolean, refresh: () => void): void {
  const peers = usePeers()
  const signature = useMemo(() => discussionSignature(peers), [peers])
  const seen = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (seen.current === signature) return
    const first = seen.current === null
    seen.current = signature
    if (!first) refresh()
  }, [enabled, signature, refresh])
}
