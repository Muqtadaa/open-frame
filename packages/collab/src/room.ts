import * as Y from 'yjs'

import {
  createAwareness,
  encodeAllAwareness,
  encodeAwareness,
  encodeSyncStep1,
  readMessage,
  removeAwarenessClients,
  type Awareness,
} from './protocol.js'

/**
 * A board room, with no idea it is running inside a Durable Object.
 *
 * Everything that decides anything lives here: who gets told what, which
 * cursors disappear when a socket drops, when the document is worth saving.
 * The Durable Object around it does three things this cannot — hold sockets,
 * hold storage, and hold a name — and nothing else.
 *
 * The seam is here because of what it buys: the whole room is exercised below
 * by objects with a `send` method. ADR 0013 is only reversible while that
 * holds, and a room that could only be tested by deploying it would have made
 * the transport decision permanent the day it shipped.
 */

/** One connected client, as far as the room is concerned. */
export interface RoomPeer {
  /** Stable for the life of the connection, and unique within the room. */
  readonly id: string
  send(message: Uint8Array): void
}

export interface BoardRoomOptions {
  /** A document already loaded from storage, or an empty one for a new board. */
  readonly doc?: Y.Doc
  /**
   * Called after the document changes, never for presence.
   *
   * Presence is not history — it is where somebody's cursor is right now — so
   * persisting it would mean writing to storage on every mouse move to save
   * something meaningless the moment they close the tab.
   */
  readonly onDocumentChanged?: () => void
}

export class BoardRoom {
  readonly #doc: Y.Doc
  readonly #awareness: Awareness
  readonly #peers = new Map<string, RoomPeer>()
  /**
   * Which awareness client ids arrived down which socket.
   *
   * A client id is chosen by the client and has no relationship to the
   * connection, so the only way to know whose cursor to remove when a socket
   * drops is to remember what that socket told us about.
   */
  readonly #controlled = new Map<string, Set<number>>()
  readonly #onDocumentChanged: (() => void) | undefined
  readonly #onAwareness: (changes: AwarenessChanges, origin: unknown) => void
  readonly #onUpdate: () => void

  constructor(options: BoardRoomOptions = {}) {
    this.#doc = options.doc ?? new Y.Doc()
    this.#awareness = createAwareness(this.#doc)
    this.#onDocumentChanged = options.onDocumentChanged

    this.#onAwareness = (changes, origin) => {
      if (typeof origin !== 'string') return
      const owned = this.#controlled.get(origin)
      if (owned === undefined) return
      for (const client of [...changes.added, ...changes.updated]) owned.add(client)
      for (const client of changes.removed) owned.delete(client)
    }
    this.#awareness.on('update', this.#onAwareness)

    this.#onUpdate = () => {
      this.#onDocumentChanged?.()
    }
    this.#doc.on('update', this.#onUpdate)
  }

  get doc(): Y.Doc {
    return this.#doc
  }

  get awareness(): Awareness {
    return this.#awareness
  }

  /** Everyone currently connected. The Durable Object rebuilds this after hibernating. */
  get peerCount(): number {
    return this.#peers.size
  }

  /**
   * Adds a peer and opens the conversation.
   *
   * The room speaks first, with a state vector rather than the document: the
   * peer answers with only what this room is missing, so joining a board with
   * ten thousand objects on it costs a round trip and a diff, not a download.
   *
   * **The peer must send its own step 1 too.** The sync protocol is symmetric
   * and each step 1 asks for one direction of the diff, so a client that only
   * ANSWERS this one tells the room what it has and is never told what the room
   * has — it sits on an empty board while the room holds the real one. Two
   * tests failed exactly that way before the test client sent it, which is the
   * only reason the requirement is written down here rather than discovered
   * again by whoever writes the next client.
   */
  join(peer: RoomPeer): void {
    this.#peers.set(peer.id, peer)
    this.#controlled.set(peer.id, new Set())

    peer.send(encodeSyncStep1(this.#doc))
    const presence = encodeAllAwareness(this.#awareness)
    if (presence !== null) peer.send(presence)
  }

  /** Applies a message from a peer and sends whatever it obliges the room to send. */
  receive(peer: RoomPeer, message: Uint8Array): void {
    const { reply, broadcast } = readMessage(this.#doc, this.#awareness, message, peer.id)
    if (reply !== null) peer.send(reply)
    if (broadcast !== null) this.#broadcast(broadcast, peer.id)
  }

  /**
   * Drops a peer and takes its cursors with it.
   *
   * The removal is announced, because an unannounced one leaves a ghost: every
   * other client goes on drawing a cursor for somebody who closed the tab, and
   * nothing will ever move it again.
   */
  leave(peer: RoomPeer): void {
    this.#peers.delete(peer.id)
    const owned = this.#controlled.get(peer.id)
    this.#controlled.delete(peer.id)
    if (owned === undefined || owned.size === 0) return

    const gone = [...owned]
    removeAwarenessClients(this.#awareness, gone, peer.id)
    this.#broadcast(encodeAwareness(this.#awareness, gone), peer.id)
  }

  /** The whole document, for persistence. */
  snapshot(): Uint8Array {
    return Y.encodeStateAsUpdate(this.#doc)
  }

  /** Releases the observers. The document is left alone; the caller owns it. */
  destroy(): void {
    this.#doc.off('update', this.#onUpdate)
    this.#awareness.off('update', this.#onAwareness)
    this.#peers.clear()
    this.#controlled.clear()
  }

  #broadcast(message: Uint8Array, exceptPeerId: string): void {
    for (const [id, peer] of this.#peers) {
      if (id === exceptPeerId) continue
      /*
       * One peer's socket failing must not stop the others hearing about the
       * change. A send throws when a connection has gone away between the
       * message arriving and this loop reaching it, which is ordinary.
       */
      try {
        peer.send(message)
      } catch {
        // The close handler removes it; nothing useful to do here.
      }
    }
  }
}

interface AwarenessChanges {
  readonly added: number[]
  readonly updated: number[]
  readonly removed: number[]
}

/** Restores a room's document from a stored snapshot. */
export function documentFromSnapshot(snapshot: Uint8Array | null): Y.Doc {
  const doc = new Y.Doc()
  if (snapshot !== null && snapshot.byteLength > 0) Y.applyUpdate(doc, snapshot)
  return doc
}
