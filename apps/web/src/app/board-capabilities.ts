import type { BoardAction, Capabilities } from '@openframe/core'

/**
 * What this client may do, which it does not know when the board opens.
 *
 * The dispatcher is built before the socket exists — the whole application is
 * wired to a board before React renders — and the room does not say whether
 * this is a view-only connection until some milliseconds later. So the answer
 * has to be able to change once, from outside.
 *
 * It starts as `editor` and narrows, never the other way. That direction is
 * chosen deliberately: an interface that starts locked and unlocks flickers a
 * disabled toolbar at everybody on every load, to protect against a window in
 * which the ROOM is already refusing the writes anyway. The client check is a
 * UX affordance — `capabilities.ts` in core says so — and the cost of being
 * briefly optimistic is a rejected local edit, not a leaked one.
 *
 * `narrow` is one-way. A room that somehow said `editor` after saying `viewer`
 * would be a room contradicting itself, and the safe reading of a contradiction
 * is the one that grants less.
 */
export interface BoardCapabilities extends Capabilities {
  /** Called when the room reports a role. Only ever takes permission away. */
  readonly narrowTo: (role: 'editor' | 'viewer') => void
  readonly readOnly: () => boolean
}

const VIEWER_MAY: readonly BoardAction[] = ['view', 'comment']

export function createBoardCapabilities(): BoardCapabilities {
  let readOnly = false

  return {
    can(action: BoardAction): boolean {
      return readOnly ? VIEWER_MAY.includes(action) : true
    },
    narrowTo(role) {
      if (role === 'viewer') readOnly = true
    },
    readOnly() {
      return readOnly
    },
  }
}
