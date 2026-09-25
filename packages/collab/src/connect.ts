import type { CommandDispatcher, CommandError, DocumentStore } from '@openframe/core'
import * as Y from 'yjs'

import { seedDoc } from './document-map.js'
import { createAwareness, type RoomRole } from './protocol.js'
import { RoomProvider, type ConnectionStatus, type RoomSocket } from './provider.js'
import { CollabSession } from './session.js'

/**
 * Everything an application needs to put a board in a room, with no Yjs type
 * crossing the boundary.
 *
 * That is not neatness. `yjs-lives-only-in-collab` is a build failure, so if
 * the web app had to name a `Y.Doc` to start a session, the rule would have to
 * be weakened — and the rule is the thing keeping ADR 0013 reversible. The app
 * gets a `BoardConnection`: a status, a presence channel, and a way to stop.
 */

export interface PeerPresence {
  /** The Yjs client id. Unique per tab, and meaningless outside the room. */
  readonly clientId: number
  readonly state: Record<string, unknown>
}

export interface BoardConnection {
  readonly status: ConnectionStatus
  /**
   * What the room will let this connection do.
   *
   * `editor` until the room says otherwise, which it does before sending any
   * of the board. The optimistic default is safe because this value only
   * drives what the interface OFFERS — the room enforces the truth whatever a
   * client believes.
   */
  readonly role: RoomRole
  /**
   * Whether the room has sent the board yet.
   *
   * `status` cannot answer this: a socket is open a round trip before the
   * document arrives. A browser does not care — it renders what it has and
   * re-renders when more lands — but a process that reads the document once
   * and answers a question with it does.
   */
  readonly synced: boolean
  /** Called when the board arrives, or immediately if it already has. */
  onSynced(listener: () => void): () => void
  /** This client's presence. Replaces the previous state wholesale. */
  setPresence(state: Record<string, unknown> | null): void
  /** Everyone else in the room, whenever that changes. Returns an unsubscribe. */
  onPeers(listener: (peers: readonly PeerPresence[]) => void): () => void
  onStatus(listener: (status: ConnectionStatus) => void): () => void
  onRole(listener: (role: RoomRole) => void): () => void
  destroy(): void
}

/**
 * Where this browser keeps the board's CRDT between sessions.
 *
 * A port, so `@openframe/collab` still names no storage — the same reason the
 * socket is injected. It is scoped to one board by whoever supplies it.
 */
export interface CrdtStore {
  /** The stored state, or `null` for a board this browser has never held. */
  readonly load: () => Promise<Uint8Array | null>
  /** Fire and forget: a state that could not be written costs the next reload. */
  readonly save: (state: Uint8Array) => void
}

export interface ConnectBoardOptions {
  readonly store: DocumentStore
  readonly dispatcher: CommandDispatcher
  readonly connect: () => RoomSocket
  readonly onError: (error: CommandError) => void
  /**
   * Where the CRDT lives between page loads. Omitted, the board still works —
   * it just works the way it did before this existed, which is the bug below.
   */
  readonly persistence?: CrdtStore
  /**
   * Whether this client publishes its local board into the room when it has
   * never held the room's CRDT.
   *
   * True for a browser, which is where the board came FROM. False for a peer
   * that has no board of its own and is joining to read one: seeding an empty
   * document does not merely add nothing, it sets the room's title to whatever
   * an empty document is called — so a headless peer joining to answer a
   * question would rename the board on its way in.
   */
  readonly seed?: boolean
}

/**
 * Puts a board in its room, and remembers its CRDT.
 *
 * The persistence is not an optimisation. Without it every session after the
 * first begins from an EMPTY `Y.Doc` while the board on screen comes from
 * IndexedDB and is full — and `applyPatchesToDoc` correctly DROPS a `set`
 * against an object the doc does not hold. In an empty doc that is every
 * object on the board, so moving a note, recolouring it or rewriting its text
 * wrote nothing into the CRDT at all. Online the window closed when the room's
 * state arrived; offline it never did, and an afternoon's work reached the
 * screen and IndexedDB and was never seen by anyone else.
 *
 * `offline.test.ts` holds that as an executable statement, including the half
 * that always worked: a NEW object carries its whole self, so it synced fine.
 * That is why the original trace pointed the wrong way.
 */
export async function connectBoard(options: ConnectBoardOptions): Promise<BoardConnection> {
  const doc = new Y.Doc()

  const stored = (await options.persistence?.load()) ?? null
  /*
   * Applied BEFORE the session joins, so the observer that turns doc changes
   * into commands is not yet attached: restoring this browser's own state is
   * not a remote change and must not be dispatched as one.
   */
  if (stored !== null) Y.applyUpdate(doc, stored)

  const awareness = createAwareness(doc)

  /*
   * Seeding is now a QUESTION ABOUT STORAGE rather than a flag somebody has to
   * remember to clear: this browser publishes the local board only when it has
   * never held the CRDT for it. Re-seeding a doc rebuilt from IndexedDB would
   * resurrect everything anyone else had deleted, because such a doc carries
   * no deletion history — a persisted one does, which is what makes this safe.
   */
  if (stored === null && (options.seed ?? true)) seedDoc(doc, options.store.getDocument())

  if (options.persistence !== undefined) {
    const persistence = options.persistence
    // Encoded per update, which is one USER ACTION rather than one keystroke:
    // rule 4 means nothing is written during a drag. Autosave already writes
    // the whole document on the same beat.
    doc.on('update', () => {
      persistence.save(Y.encodeStateAsUpdate(doc))
    })
  }

  const session = CollabSession.join({
    doc,
    dispatcher: options.dispatcher,
    onError: options.onError,
  })

  const statusListeners = new Set<(status: ConnectionStatus) => void>()
  const syncedListeners = new Set<() => void>()
  const roleListeners = new Set<(role: RoomRole) => void>()
  const peerListeners = new Set<(peers: readonly PeerPresence[]) => void>()

  const provider = new RoomProvider({
    doc,
    awareness,
    connect: options.connect,
    onStatus: (status) => {
      for (const listener of [...statusListeners]) listener(status)
    },
    onRole: (role) => {
      for (const listener of [...roleListeners]) listener(role)
    },
    onSynced: () => {
      for (const listener of [...syncedListeners]) listener()
      syncedListeners.clear()
    },
  })

  const peers = (): PeerPresence[] => {
    const out: PeerPresence[] = []
    for (const [clientId, state] of awareness.getStates() as Map<
      number,
      Record<string, unknown>
    >) {
      // Everyone EXCEPT this client: drawing your own cursor is a bug that
      // looks like lag.
      if (clientId === doc.clientID) continue
      out.push({ clientId, state })
    }
    return out
  }

  const onAwareness = (): void => {
    const current = peers()
    for (const listener of [...peerListeners]) listener(current)
  }
  awareness.on('change', onAwareness)

  provider.start()

  return {
    get status() {
      return provider.status
    },
    get role() {
      return provider.role
    },
    get synced() {
      return provider.synced
    },
    onSynced(listener) {
      // Immediately when the board is already here, like `onStatus`: a
      // subscriber that arrived after the answer would otherwise wait forever
      // for a message that has been and gone. Listeners are one-shot, because
      // the event is.
      if (provider.synced) {
        listener()
        return () => undefined
      }
      syncedListeners.add(listener)
      return () => syncedListeners.delete(listener)
    },
    setPresence(state) {
      awareness.setLocalState(state)
    },
    onPeers(listener) {
      peerListeners.add(listener)
      listener(peers())
      return () => peerListeners.delete(listener)
    },
    onStatus(listener) {
      statusListeners.add(listener)
      listener(provider.status)
      return () => statusListeners.delete(listener)
    },
    onRole(listener) {
      roleListeners.add(listener)
      // Immediately, like `onStatus`: a subscriber that mounted after the room
      // already answered would otherwise wait forever for a message that has
      // been and gone.
      listener(provider.role)
      return () => roleListeners.delete(listener)
    },
    destroy() {
      awareness.off('change', onAwareness)
      peerListeners.clear()
      statusListeners.clear()
      syncedListeners.clear()
      roleListeners.clear()
      provider.destroy()
      session.stop()
      awareness.destroy()
      doc.destroy()
    },
  }
}
