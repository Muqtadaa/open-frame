import type { RoomRole } from '@openframe/collab'

/**
 * Who a link lets in, decided without touching storage or a runtime.
 *
 * Separated from `room-object.ts` for the reason ADR 0013 gives for every
 * other seam in this app: a Durable Object can only be exercised by deploying
 * it, and **a guard that can only be run by deploying is a guard nobody runs.**
 * This is now the most security-relevant code in the repository, so it is the
 * last place that should be true of.
 *
 * Everything here is values in, decision out.
 */

export interface AccessKeys {
  readonly editor: string
  readonly viewer: string
}

/**
 * 128 bits, URL-safe. The link IS the credential, so this is the only thing
 * standing between a board and anyone who tries a URL.
 */
export function mintKey(random: (bytes: Uint8Array) => void = crypto.getRandomValues.bind(crypto)): string {
  const bytes = new Uint8Array(16)
  random(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function mintKeys(random?: (bytes: Uint8Array) => void): AccessKeys {
  return { editor: mintKey(random), viewer: mintKey(random) }
}

/**
 * What a key may do here, or `null` for a link that opens nothing.
 *
 * An UNCLAIMED room answers `editor` to everything, including a link with no
 * key at all. That is not an oversight and it is the most consequential line
 * in the file: every board shared before roles existed is unclaimed, and those
 * links must keep working exactly as they did the day they were sent. Refusing
 * them would break them; silently demoting their holders to viewers would be
 * worse, because nothing would look broken.
 */
export function roleForKey(keys: AccessKeys | undefined, key: string | null): RoomRole | null {
  if (keys === undefined) return 'editor'
  if (key === null) return null
  /*
   * A plain comparison. The timing signal is real and, here, unreachable: the
   * attacker is across the internet, network jitter is orders of magnitude
   * larger than the difference, and the secret is 128 bits — a channel needing
   * more requests than the room could serve in the lifetime of the universe.
   */
  if (key === keys.editor) return 'editor'
  if (key === keys.viewer) return 'viewer'
  return null
}

export type ClaimDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: number; readonly error: string }

/**
 * Whether this board may have its two links minted now.
 *
 * Both conditions carry weight:
 *
 * - **Already keyed** — a second claim must not rotate the links out from
 *   under everyone holding them, so claiming is once per board, forever.
 * - **Already has content** — this is what stops a takeover. Without it,
 *   anyone holding a legacy link could claim that room and lock out the person
 *   whose board it is. A board being shared for the first time claims BEFORE
 *   anything is written to it, so the empty case is the honest one.
 */
export function claimDecision(
  keys: AccessKeys | undefined,
  hasContent: boolean,
): ClaimDecision {
  if (keys !== undefined) {
    return { ok: false, status: 409, error: 'This board already has links' }
  }
  if (hasContent) {
    return {
      ok: false,
      status: 409,
      error: 'This board was shared before links had roles, and stays as it was',
    }
  }
  return { ok: true }
}

/**
 * The role attached to a socket, re-read after the runtime evicted the room.
 *
 * `viewer` for anything this version cannot read. The role was decided when
 * the connection was accepted and lives on the connection; an attachment
 * written by a future version must not be promoted to write access because
 * this one failed to understand it.
 */
export function roleFromAttachment(attached: { readonly role?: unknown } | null): RoomRole {
  return attached?.role === 'editor' ? 'editor' : 'viewer'
}
