import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'

import { asOrderKey, type OrderKey } from './ids.js'

/**
 * Sibling ordering.
 *
 * OpenFrame orders siblings with fractional indices rather than integer
 * z-indices. Inserting between two neighbours produces a new key strictly
 * between them, so a reorder writes exactly ONE object instead of renumbering
 * every sibling.
 *
 * That matters for three reasons, all of which are expensive to retrofit:
 *   - undo entries stay proportional to what the user actually changed;
 *   - persistence writes stay small;
 *   - concurrent reorders by two users merge without clobbering each other.
 *
 * Keys are compared as plain strings. Never parse one as a number.
 */

/** Places a key between two neighbours. Pass `null` for "no neighbour on that side". */
export function orderBetween(before: OrderKey | null, after: OrderKey | null): OrderKey {
  return asOrderKey(generateKeyBetween(before, after))
}

/** Places `count` evenly spaced keys between two neighbours. */
export function ordersBetween(
  before: OrderKey | null,
  after: OrderKey | null,
  count: number,
): OrderKey[] {
  if (count <= 0) return []
  return generateNKeysBetween(before, after, count).map(asOrderKey)
}

/** The key for the first object in an empty container. */
export function firstOrder(): OrderKey {
  return orderBetween(null, null)
}

/** Comparator for `Array.prototype.sort`. */
export function compareOrder(a: OrderKey, b: OrderKey): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Key length grows when objects are repeatedly dropped between the SAME two
 * neighbours. Measured against `fractional-indexing` v4, growth is roughly one
 * character per six such inserts, so this threshold is reached after about 230
 * of them — deliberate, repetitive reordering rather than ordinary use.
 *
 * We do not prevent the growth; we detect it, so a rebalance can be scheduled.
 * Rebalancing rewrites every sibling, which conflicts badly under concurrent
 * editing — once collaboration exists it must be server-coordinated.
 * See docs/appendices/c-risks.md (R5).
 */
export const ORDER_KEY_REBALANCE_THRESHOLD = 40

export function needsRebalance(keys: readonly OrderKey[]): boolean {
  return keys.some((key) => key.length >= ORDER_KEY_REBALANCE_THRESHOLD)
}
