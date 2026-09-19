import {
  asObjectId,
  clampZoom,
  type ObjectId,
  type Point,
  type Viewport,
} from '@openframe/core'

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
  /**
   * How far this peer has moved their SELECTION in a drag that has not
   * committed yet, or `null` when they are not dragging.
   *
   * This is the whole of rule 4 honoured rather than bent. Nothing is written
   * to the document until the gesture commits, so without this another
   * person's note sits still and then teleports on release. The offset is
   * presence: it slides with no write, no undo entry and no storage row.
   *
   * It applies to `selection`, not to a list of its own, because the two are
   * always the same set — `pointer-controller` selects the objects it is about
   * to translate in the same batch, in both of its branches. Publishing the
   * ids again would be a second copy of a fact already on the wire, and the
   * copy is what goes stale.
   */
  readonly drag: DragDelta | null
  /**
   * Where this peer is looking, for anybody following them.
   *
   * `null` from a client too old to send one, which is the only reason it is
   * nullable — a viewport always exists. A follower with nothing to follow
   * simply stays where it is rather than jumping to the origin.
   */
  readonly viewport: Viewport | null
  /**
   * The client id this peer is following, or `null` when they are looking
   * where they chose to.
   *
   * PUBLISHED so that nobody follows a follower. Without it, A following B and
   * B following A is a viewport that feeds itself: each client copies the
   * other and neither is driving. Longer chains are the same fault wearing a
   * bigger hat, and one flag forbids every length of them, because a follower
   * is never a valid target.
   */
  readonly following: number | null
  /**
   * How many times this peer has changed the discussion since they connected.
   *
   * A NUDGE, not the comments themselves. Comments are not in the CRDT — a
   * remark in the document would be in undo, in export, in search and in the
   * registry — so they cannot ride the board's own updates. This counter rides
   * presence instead: it says "there is something new to read", and every
   * other client re-reads from the database, which stays the one source of
   * truth about what was said.
   *
   * A counter rather than a flag because a flag cannot be raised twice. Two
   * comments in quick succession would set `true` on an already-`true` field
   * and the second would reach nobody.
   */
  readonly said: number
}

/** How far, in world units. Never a position — always an offset. */
export interface DragDelta {
  readonly dx: number
  readonly dy: number
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

/**
 * A drag offset, or `null` for anything that is not two finite numbers.
 *
 * The same reasoning as `finitePoint`, and the same consequence: a `NaN` here
 * becomes a transform the browser drops, taking the layer with it. An offset
 * is also unbounded by nature — there is no maximum sensible distance to move
 * something on an infinite canvas — so this clamps nothing and only insists
 * the values are real.
 */
function dragDelta(value: unknown): DragDelta | null {
  if (typeof value !== 'object' || value === null) return null
  const { dx, dy } = value as { dx?: unknown; dy?: unknown }
  if (typeof dx !== 'number' || typeof dy !== 'number') return null
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null
  return { dx, dy }
}

/**
 * A peer's viewport, or `null` for anything that is not three real numbers.
 *
 * The zoom is CLAMPED rather than rejected: a peer running a build with a
 * wider range is still somewhere definite, and refusing it would strand a
 * follower. A NaN is refused outright, for the reason `finitePoint` gives.
 */
function viewportOf(value: unknown): Viewport | null {
  if (typeof value !== 'object' || value === null) return null
  const { x, y, zoom } = value as { x?: unknown; y?: unknown; zoom?: unknown }
  if (typeof x !== 'number' || typeof y !== 'number' || typeof zoom !== 'number') return null
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom)) return null
  return { x, y, zoom: clampZoom(zoom) }
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
    drag: rawDrag,
    viewport: rawViewport,
    following: rawFollowing,
    said: rawSaid,
  } = raw as {
    name?: unknown
    hue?: unknown
    cursor?: unknown
    selection?: unknown
    editing?: unknown
    drag?: unknown
    viewport?: unknown
    following?: unknown
    said?: unknown
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
    drag: dragDelta(rawDrag),
    viewport: viewportOf(rawViewport),
    // A client id is an integer Yjs assigns. Anything else is not one, and a
    // follower chasing a target that cannot exist would never let go.
    following:
      typeof rawFollowing === 'number' && Number.isInteger(rawFollowing) ? rawFollowing : null,
    // Only ever compared against its own previous value, so the magnitude
    // means nothing and a negative or fractional one is simply not a count.
    said: typeof rawSaid === 'number' && Number.isInteger(rawSaid) && rawSaid >= 0 ? rawSaid : 0,
  }
}

/**
 * Whether this peer may be followed.
 *
 * A follower is never a valid target. That single rule is what stops two
 * people following each other into a viewport that feeds itself, and it stops
 * every longer chain for free — the second link can never be made.
 */
export function canFollow(peer: Peer): boolean {
  return peer.following === null && peer.viewport !== null
}

/**
 * Where each object is being held right now, by somebody else.
 *
 * One pass over the peers rather than a lookup per object: culling already
 * asks every visible object to draw itself, and having each of them scan the
 * peer list would be the O(n²) that rule 10 exists to forbid.
 *
 * An object dragged by two people at once takes the LOWEST client id, the same
 * tie-break `editorsByObject` uses and for the same reason — every client
 * works this out independently and they must all agree.
 */
export function dragsByObject(peers: readonly Peer[]): ReadonlyMap<ObjectId, DragDelta> {
  const moved = new Map<ObjectId, DragDelta>()
  const claimedBy = new Map<ObjectId, number>()
  for (const peer of peers) {
    if (peer.drag === null) continue
    for (const id of peer.selection) {
      const held = claimedBy.get(id)
      if (held !== undefined && held <= peer.clientId) continue
      claimedBy.set(id, peer.clientId)
      moved.set(id, peer.drag)
    }
  }
  return moved
}

/**
 * One value that changes whenever anybody's contribution to the discussion
 * does — a string, so a consumer may hold it in a Zustand selector.
 *
 * A SUM would be wrong. One peer posting while another who had posted leaves
 * cancels out, and the comment that arrived in that moment reaches nobody. A
 * signature over who is here and what each of them has said cannot cancel.
 *
 * It changes when the room's membership changes too, which costs a re-read
 * nobody strictly needed — and buys the case that matters: somebody who
 * commented, closed the tab and came back is carrying a count this client has
 * never seen.
 */
export function discussionSignature(peers: readonly Peer[]): string {
  let signature = ''
  for (const peer of peers) signature += `${String(peer.clientId)}:${String(peer.said)},`
  return signature
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
