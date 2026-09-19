import { asObjectId, type ObjectId, type Point } from '@openframe/core'

/**
 * What one person's presence says, and how much of it to believe.
 *
 * Presence arrives from another browser and is shaped by whatever that browser
 * decided to send, so every field is narrowed here before anything renders it.
 * That is rule 8 — validate at boundaries — and a remote peer is as much a
 * boundary as a file upload: a `cursor.x` of `NaN` would put a cursor nowhere a
 * transform can express, and an unbounded `selection` would have this client
 * drawing outlines until it stopped.
 *
 * A presence state is also never an AUTHORIZATION. It says who somebody is
 * calling themselves, which is a label, and the room does not read it at all.
 */

/** How many outlines one peer may claim. Past this, they are not collaborating. */
const MAX_SELECTION = 200
const MAX_NAME = 24

export interface PresenceState {
  readonly name: string
  /** An index into the `--of-p-*` palette, already clamped to a real one. */
  readonly hue: number
  readonly cursor: Point | null
  readonly selection: readonly ObjectId[]
  /** The object this peer has open in an inline editor, if any. */
  readonly editing: ObjectId | null
}

export interface Peer extends PresenceState {
  readonly clientId: number
}

export const PRESENCE_HUES = 6

function finitePoint(value: unknown): Point | null {
  if (typeof value !== 'object' || value === null) return null
  const { x, y } = value as { x?: unknown; y?: unknown }
  if (typeof x !== 'number' || typeof y !== 'number') return null
  // A non-finite coordinate produces a transform the browser silently drops,
  // taking the whole layer's rendering with it on some engines.
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

function objectIds(value: unknown): ObjectId[] {
  if (!Array.isArray(value)) return []
  const ids: ObjectId[] = []
  for (const entry of value.slice(0, MAX_SELECTION)) {
    if (typeof entry === 'string' && entry.length > 0 && entry.length <= 64) {
      ids.push(asObjectId(entry))
    }
  }
  return ids
}

/** Narrows a raw awareness state, or `null` if there is nothing usable in it. */
export function readPresence(raw: unknown): PresenceState | null {
  if (typeof raw !== 'object' || raw === null) return null
  const {
    name: rawName,
    hue: rawHue,
    cursor: rawCursor,
    selection: rawSelection,
    editing: rawEditing,
  } = raw as {
    name?: unknown
    hue?: unknown
    cursor?: unknown
    selection?: unknown
    editing?: unknown
  }

  const name = typeof rawName === 'string' ? rawName.slice(0, MAX_NAME).trim() : ''
  const hue =
    typeof rawHue === 'number' && Number.isInteger(rawHue) && rawHue >= 0 && rawHue < PRESENCE_HUES
      ? rawHue
      : 0
  const editing =
    typeof rawEditing === 'string' && rawEditing.length > 0 && rawEditing.length <= 64
      ? asObjectId(rawEditing)
      : null

  return {
    name: name === '' ? 'Guest' : name,
    hue,
    cursor: finitePoint(rawCursor),
    selection: objectIds(rawSelection),
    editing,
  }
}

/** The palette entry for a peer. A token name, never a colour value. */
export function hueVar(hue: number): string {
  return `var(--of-p-${String((hue % PRESENCE_HUES) + 1)})`
}

/**
 * Who has each object open for editing.
 *
 * One editor per object: if two peers claim the same one, the LOWEST client id
 * wins. Deterministic rather than first-come, because every client works it out
 * independently from the same awareness state and they must all agree — the
 * same reasoning as breaking a parent cycle by lowest id.
 */
export function editorsByObject(peers: readonly Peer[]): ReadonlyMap<ObjectId, Peer> {
  const editors = new Map<ObjectId, Peer>()
  for (const peer of peers) {
    if (peer.editing === null) continue
    const held = editors.get(peer.editing)
    if (held === undefined || peer.clientId < held.clientId) editors.set(peer.editing, peer)
  }
  return editors
}

/** The initial shown on a chip. One character, so six of them fit on a line. */
export function initialOf(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase()
}
