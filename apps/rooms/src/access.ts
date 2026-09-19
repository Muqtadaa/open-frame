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
  /**
   * The OWNER's key. Absent on a board claimed before this existed.
   *
   * A third key rather than an identity, because the room authorizes by key
   * and has never heard of Supabase. What makes it mean "owner" is where it is
   * kept: a column only the board's owner can read, behind the same row-level
   * security as everything else about that board. So this is the holder of a
   * key only the owner is ever given — not a verified identity — which is the
   * trust model the other two keys already rest on.
   *
   * It grants two things the edit link does not: setting the password, and not
   * being asked for it. It is never a link — it travels beside one.
   */
  readonly owner?: string
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
  return { editor: mintKey(random), viewer: mintKey(random), owner: mintKey(random) }
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
  /*
   * NOT the owner key. It is deliberately not a link: the owner opens their
   * board on the edit link like anybody else, and carries the owner key beside
   * it. Accepting it here would put it in the page URL, and a URL copied out
   * of the address bar and pasted to somebody would hand them the board's
   * password along with it.
   */
  return null
}

/**
 * Whether this key is the board's owner key.
 *
 * Separate from `roleForKey` because the ROLE is the same as an editor's. What
 * differs is authority over the board's password, and reading that off a role
 * would mean giving every editor the same.
 */
export function isOwnerKey(keys: AccessKeys | undefined, key: string | null): boolean {
  if (keys?.owner === undefined || key === null) return false
  return key === keys.owner
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

export type DestroyDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: number; readonly error: string }

/**
 * Whether this board's room may be destroyed now.
 *
 * The first destructive thing the room can be asked to do, so the rules are
 * stated rather than implied:
 *
 * - **The editor key, and only it.** A viewer was given the weaker link
 *   precisely so they could not change the board; destroying it is the largest
 *   change there is.
 * - **A legacy room refuses.** An unclaimed room has no keys, and `roleForKey`
 *   deliberately lets anyone in — which is right for reading a board shared
 *   before roles existed and catastrophic for deleting one. There is no key to
 *   check, so there is no one to trust, so the answer is no. Such a board can
 *   still be dropped from its owner's list; what survives is the room, which
 *   holds a copy of a board its owner wanted gone. That is the cost, and it is
 *   smaller than a link nobody minted being able to destroy somebody's work.
 * - **A destroyed room stays destroyed.** Re-running this is not an error,
 *   but it must not read as permission returning.
 */
export function destroyDecision(
  keys: AccessKeys | undefined,
  key: string | null,
  destroyed = false,
): DestroyDecision {
  if (destroyed) {
    return { ok: false, status: 410, error: 'This board no longer exists' }
  }
  if (keys === undefined) {
    return {
      ok: false,
      status: 409,
      error: 'This board was shared before links had roles, and cannot be deleted from here',
    }
  }
  // The same answer for a wrong key, a missing one, and the view link. Saying
  // "that is the viewer key" tells somebody which half of the guess to keep.
  if (key === null || key !== keys.editor) {
    return { ok: false, status: 403, error: 'That link does not open this board' }
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

export type PasswordDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: number; readonly error: string }

/**
 * Whether this board's password may be set, changed or cleared now.
 *
 * THE OWNER KEY, and only it. Not the edit link: everybody invited to change
 * the board holds that one, and deciding who may open the board at all is not
 * the same authority as changing what is on it.
 *
 * A board claimed BEFORE owner keys existed has none, and for those the edit
 * key stands in. That is not a loophole left open: such a board has no owner
 * key for anyone to hold, the alternative is that its password can never be
 * set by anybody, and the edit key can already destroy the board outright. It
 * closes the moment the board adopts one, which is once and permanent.
 *
 * A LEGACY UNCLAIMED room still refuses. There are no keys at all, so there is
 * nobody to trust — the same reasoning `destroyDecision` gives.
 */
export function setPasswordDecision(
  keys: AccessKeys | undefined,
  key: string | null,
  destroyed = false,
): PasswordDecision {
  if (destroyed) {
    return { ok: false, status: 410, error: 'This board no longer exists' }
  }
  if (keys === undefined) {
    return {
      ok: false,
      status: 409,
      error: 'This board was shared before links had roles, and cannot take a password',
    }
  }
  const required = keys.owner ?? keys.editor
  if (key === null || key !== required) {
    return { ok: false, status: 403, error: 'Only the board’s owner can do that' }
  }
  return { ok: true }
}

/**
 * Whether a password may even be attempted on this board.
 *
 * BOTH factors, in this order. The link is checked first because it is free
 * and because a password attempt against a board whose link you do not hold
 * should tell you nothing at all — including whether that board has a
 * password. Either link will do: the password protects the board, not a role,
 * so a viewer redeems it exactly as an editor does and is still a viewer
 * afterwards.
 *
 * The password itself is checked by the caller, which is where the hashing
 * lives. This is only the part that can be decided without awaiting anything.
 */
export function unlockDecision(
  keys: AccessKeys | undefined,
  key: string | null,
  hasPassword: boolean,
  destroyed = false,
): PasswordDecision {
  if (destroyed) {
    return { ok: false, status: 410, error: 'This board no longer exists' }
  }
  if (roleForKey(keys, key) === null) {
    return { ok: false, status: 403, error: 'That link does not open this board' }
  }
  if (!hasPassword) {
    return { ok: false, status: 409, error: 'This board has no password' }
  }
  return { ok: true }
}
