import type { ObjectId, Origin, Patch, RevertableChange } from '@openframe/core'
import type * as Y from 'yjs'

/**
 * The board's change log: the changes somebody OTHER than a person made —
 * an agent over MCP, an AI feature, an API call — kept where every peer can
 * see them and take them back (tracks A-2).
 *
 * Only patches cross the wire. Without this, an agent's label, its origin and
 * where one of its changes began and ended stayed in the agent's own process:
 * a person watching the board could neither undo the change nor even point at
 * it. A person's own changes are not logged, because their undo covers them.
 *
 * It is its OWN root map, and must stay one. The room relays and stores any
 * root map without reading it, and an older client observes `objects` and
 * `meta` only, so it carries this along and never turns it into a change to
 * the board. `meta` would not do: an older client copies every key it finds
 * there into the document.
 *
 * It is a record of changes the dispatcher made, like an undo stack — never
 * board content. Taking an entry back goes through `CommandDispatcher.revert`
 * (rule 3), which checks what it would put back as it checks a merge, because
 * any editor of the board can write here.
 */

export const CHANGES = 'changes'

/** The origins whose changes are logged: everyone who is not a person at this board. */
export const LOGGED_ORIGINS: ReadonlySet<Origin> = new Set<Origin>(['mcp', 'ai', 'api'])

/**
 * How many entries the log keeps. Enough to find what an agent did in a
 * working session; small enough that a board's CRDT does not grow a history
 * of every agent that ever touched it.
 */
export const CHANGE_LOG_LIMIT = 50

export interface LoggedChange extends RevertableChange {
  /** The dispatcher's transaction id, which is also the entry's key. */
  readonly id: string
  readonly origin: Origin
  /** Milliseconds since the epoch, on the clock of whoever made the change. */
  readonly at: number
  /** Who made it, as a name to show — `null` when the peer did not say. */
  readonly by: string | null
  readonly affected: readonly ObjectId[]
  readonly locked: { readonly before: readonly ObjectId[]; readonly after: readonly ObjectId[] }
  readonly reverted: { readonly at: number; readonly by: string | null } | null
}

export function changesOf(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap<unknown>(CHANGES)
}

/**
 * Records one change and lets the oldest go past the limit.
 *
 * Called INSIDE the transaction that writes the change's patches, so a peer
 * never receives the one without the other.
 */
export function recordChange(doc: Y.Doc, change: LoggedChange): void {
  const log = changesOf(doc)
  log.set(change.id, structuredClone(change))
  if (log.size <= CHANGE_LOG_LIMIT) return
  const oldest = [...log.entries()]
    .map(([key, value]) => ({ key, at: readLoggedChange(value)?.at ?? -Infinity }))
    .sort((left, right) => left.at - right.at)
    .slice(0, log.size - CHANGE_LOG_LIMIT)
  for (const { key } of oldest) log.delete(key)
}

/** Every readable entry, newest first. One that is not an entry is left out. */
export function readChanges(doc: Y.Doc): LoggedChange[] {
  const out: LoggedChange[] = []
  for (const value of changesOf(doc).values()) {
    const change = readLoggedChange(value)
    if (change !== null) out.push(change)
  }
  return out.sort((left, right) => right.at - left.at)
}

/** Marks an entry taken back. False when there is no such entry. */
export function markReverted(doc: Y.Doc, id: string, by: string | null, at: number): boolean {
  const log = changesOf(doc)
  const change = readLoggedChange(log.get(id))
  if (change === null) return false
  log.set(id, structuredClone({ ...change, reverted: { at, by } }))
  return true
}

/**
 * An entry as this client can use it, or `null`.
 *
 * Structural only: every editor of the board can write to the log, so an
 * entry is arbitrary JSON until shown otherwise (rule 8). What its patches
 * would do to the board is judged later, by `revert`, against the board as
 * it is then — the only place that question has an answer.
 */
export function readLoggedChange(value: unknown): LoggedChange | null {
  if (!isRecord(value)) return null
  const { id, label, origin, at, by, forward, inverse, affected, locked, reverted } = value
  if (typeof id !== 'string' || typeof label !== 'string') return null
  if (typeof origin !== 'string' || !LOGGED_ORIGINS.has(origin as Origin)) return null
  if (typeof at !== 'number' || !Number.isFinite(at)) return null
  if (by !== null && typeof by !== 'string') return null
  if (!isPatchList(forward) || !isPatchList(inverse)) return null
  if (!isIdList(affected)) return null
  if (!isRecord(locked) || !isIdList(locked.before) || !isIdList(locked.after)) return null
  if (reverted !== null) {
    if (!isRecord(reverted) || typeof reverted.at !== 'number') return null
    if (reverted.by !== null && typeof reverted.by !== 'string') return null
  }
  return value as unknown as LoggedChange
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIdList(value: unknown): value is ObjectId[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/**
 * A patch in the shape `Patch` says, or not. `revert` checks what an `add` or a
 * `set` would leave behind against the registry; this makes sure it can be
 * asked. A `meta` patch is held to the one field the document has, because
 * nothing downstream checks it — a merge passes the board's fields through.
 */
function isPatch(value: unknown): value is Patch {
  if (!isRecord(value)) return false
  switch (value.op) {
    case 'add':
      return typeof value.id === 'string' && isRecord(value.object)
    case 'remove':
      return typeof value.id === 'string'
    case 'set':
      return (
        typeof value.id === 'string' &&
        Array.isArray(value.path) &&
        value.path.every((key) => typeof key === 'string' || typeof key === 'number') &&
        'value' in value
      )
    case 'meta':
      return (
        Array.isArray(value.path) &&
        value.path.length === 1 &&
        value.path[0] === 'title' &&
        typeof value.value === 'string'
      )
    default:
      return false
  }
}

function isPatchList(value: unknown): value is Patch[] {
  return Array.isArray(value) && value.every(isPatch)
}
