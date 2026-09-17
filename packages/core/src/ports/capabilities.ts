import type { BoardId } from '../domain/ids.js'

/**
 * Authorization, expressed as capabilities rather than roles.
 *
 * The rule this shape exists to enforce: no code anywhere asks
 * `if (user.role === 'admin')`. It asks whether an action is permitted, and
 * something else decides how that is determined. Changing the permission model
 * later then touches one implementation instead of every call site.
 *
 * PHASE 1 IS NOT SECURE, AND IS NOT MEANT TO BE. `allowAll` exists so the
 * dispatcher has a real call site from day one. Once a server exists, every
 * command must be re-authorized SERVER-SIDE through this same interface —
 * a client-side check is a UX affordance, never a security control.
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
