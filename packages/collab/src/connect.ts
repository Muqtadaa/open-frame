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
  /** This client's presence. Replaces the previous state wholesale. */
  setPresence(state: Record<string, unknown> | null): void
  /** Everyone else in the room, whenever that changes. Returns an unsubscribe. */
  onPeers(listener: (peers: readonly PeerPresence[]) => void): () => void
  onStatus(listener: (status: ConnectionStatus) => void): () => void
  onRole(listener: (role: RoomRole) => void): () => void
  destroy(): void
}

export interface ConnectBoardOptions {
  readonly store: DocumentStore
  readonly dispatcher: CommandDispatcher
  readonly connect: () => RoomSocket
  readonly onError: (error: CommandError) => void
  /**
   * Whether to publish the local board into the room on connect.
   *
   * True exactly once, for the person who shared the board. After that the room
   * is the truth and this must be false, because a fresh `Y.Doc` built from
   * local storage carries no deletion history: re-seeding it would resurrect
   * every object anyone else has deleted since. Persisting the CRDT state
   * locally is what removes the asymmetry, and it is a Stage 3 concern.
   */
  readonly seed: boolean
}

export function connectBoard(options: ConnectBoardOptions): BoardConnection {
  const doc = new Y.Doc()
  const awareness = createAwareness(doc)

  if (options.seed) seedDoc(doc, options.store.getDocument())

  const session = CollabSession.join({
    doc,
    dispatcher: options.dispatcher,
    onError: options.onError,
  })

  const statusListeners = new Set<(status: ConnectionStatus) => void>()
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
      roleListeners.clear()
      provider.destroy()
      session.stop()
      awareness.destroy()
      doc.destroy()
    },
  }
}
