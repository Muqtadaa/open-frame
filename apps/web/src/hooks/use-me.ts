import { useMemo } from 'react'

import type { MarkAuthor } from '@openframe/core'

import { guestIdentity } from '../app/guest.js'
import { useIdentity } from './use-identity.js'

/**
 * Who this person is on a board: the name and colour others see, and the key
 * their reactions and votes are matched on.
 *
 * A signed-in person is themselves on every device, so their key comes from
 * their account; a guest's comes from this browser. Either way it is a LABEL,
 * never an authorization (ADR 0016): the room admits writers by link.
 */
export function useMe(): MarkAuthor {
  const identity = useIdentity()
  return useMemo(() => {
    if (identity === null) {
      const guest = guestIdentity()
      return { key: guest.key, name: guest.name, hue: guest.hue }
    }
    return { key: accountKey(identity.userId), name: identity.displayName, hue: identity.hue }
  }, [identity])
}

/**
 * A short key standing for an account, the same on every device.
 *
 * Hashed rather than the account id itself: a board is readable by everyone
 * with its link, and a mark only needs to be recognisable as the same person's,
 * not traceable to their account. FNV-1a over 64 bits — collisions are a
 * nuisance (two people's reactions merging), not a breach, at board scale.
 */
export function accountKey(userId: string): string {
  let hash = 0xcbf29ce484222325n
  for (const char of userId) {
    hash ^= BigInt(char.codePointAt(0) ?? 0)
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return `u_${hash.toString(16).padStart(16, '0')}`
}
