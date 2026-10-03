import type { BoardId } from '../domain/ids.js'

/**
 * Authorization, expressed as capabilities rather than roles.
 *
 * The rule this shape exists to enforce: no code anywhere asks
 * `if (user.role === 'admin')`. It asks whether an action is permitted, and
 * something else decides how that is determined. Changing the permission model
 * later then touches one implementation instead of every call site.
 *
 * THIS IS A CLIENT-SIDE CHECK, and a client-side check is a UX affordance,
 * never a security control. The control is the room's: it refuses a viewer's
 * writes and gates destroying and the password on the owner key, by key, and
 * never consults this interface (ADR 0016, docs/architecture/11-security.md).
 */
export type BoardAction = 'view' | 'comment' | 'edit' | 'manage' | 'own'

export interface Capabilities {
  can(action: BoardAction, boardId: BoardId): boolean
}

/** Single-player local development: the only actor is the person at the keyboard. */
export const allowAllCapabilities: Capabilities = { can: () => true }

export function readOnlyCapabilities(): Capabilities {
  return { can: (action) => action === 'view' || action === 'comment' }
}
