import type * as Y from 'yjs'

import {
  encodeAwareness,
  encodeSyncStep1,
  encodeUpdate,
  readMessage,
  type Awareness,
} from './protocol.js'

/**
 * The client half of a room: a socket, a `Y.Doc` and an awareness state.
 *
 * Deliberately knows nothing about the DOM. A browser `WebSocket` is adapted to
 * `RoomSocket` by the caller, which keeps this package free of DOM types and —
 * far more usefully — lets the whole provider be tested against a real
 * `BoardRoom` through a pair of fake sockets, with no network anywhere.
 */

/** The little of a WebSocket this needs. A browser one is adapted to it. */
export interface RoomSocket {
  send(data: Uint8Array): void
  close(): void
  onOpen(listener: () => void): void
  onMessage(listener: (data: Uint8Array) => void): void
  onClose(listener: () => void): void
  onError(listener: () => void): void
}

export type ConnectionStatus = 'connecting' | 'connected' | 'offline'

export interface RoomProviderOptions {
  readonly doc: Y.Doc
  readonly awareness: Awareness
  /** Opens a new socket. Called again on every reconnection attempt. */
  readonly connect: () => RoomSocket
  readonly onStatus?: (status: ConnectionStatus) => void
  /** Injected so tests do not wait in real time. */
  readonly setTimer?: (run: () => void, ms: number) => unknown
  readonly clearTimer?: (handle: unknown) => void
}

/** Backoff, doubling to a ceiling. */
const FIRST_RETRY_MS = 1_000
const MAX_RETRY_MS = 30_000

/** Explicit, so an omitted callback reads as a decision rather than an empty block. */
const noop = (): void => undefined

/** The origin marking changes that came from the room, so they are not echoed back. */
const FROM_ROOM = 'room'

export class RoomProvider {
  readonly #doc: Y.Doc
  readonly #awareness: Awareness
  readonly #connect: () => RoomSocket
  readonly #onStatus: (status: ConnectionStatus) => void
  readonly #setTimer: (run: () => void, ms: number) => unknown
  readonly #clearTimer: (handle: unknown) => void

  #socket: RoomSocket | null = null
  #status: ConnectionStatus = 'offline'
  #retryMs = FIRST_RETRY_MS
  #retryHandle: unknown = null
  #stopped = false

  constructor(options: RoomProviderOptions) {
    this.#doc = options.doc
    this.#awareness = options.awareness
    this.#connect = options.connect
    this.#onStatus = options.onStatus ?? noop
    this.#setTimer = options.setTimer ?? ((run, ms) => setTimeout(run, ms))
    this.#clearTimer = options.clearTimer ?? ((handle) => {
      clearTimeout(handle as ReturnType<typeof setTimeout>)
    })

    this.#doc.on('update', this.#onDocUpdate)
    this.#awareness.on('update', this.#onAwarenessUpdate)
  }

  get status(): ConnectionStatus {
    return this.#status
  }

  /** Opens the connection, and keeps reopening it until `destroy` is called. */
  start(): void {
    if (this.#stopped || this.#socket !== null) return
    this.#setStatus('connecting')

    const socket = this.#connect()
    this.#socket = socket

    socket.onOpen(() => {
      this.#setStatus('connected')
      this.#retryMs = FIRST_RETRY_MS

      /*
       * The client opens with its OWN step 1, and this is the half of the
       * handshake that fetches the board. The room sends its step 1 too; each
       * one asks for a different direction of the diff, so a client that only
       * answers the room's sits on an empty board while the room holds the real
       * one. Two tests in room.test.ts failed exactly that way.
       */
      socket.send(encodeSyncStep1(this.#doc))

      // And announce ourselves, so the people already here see a cursor.
      const local = this.#awareness.getLocalState()
      if (local !== null) socket.send(encodeAwareness(this.#awareness, [this.#doc.clientID]))
    })

    socket.onMessage((data) => {
      const { reply } = readMessage(this.#doc, this.#awareness, data, FROM_ROOM)
      if (reply !== null) socket.send(reply)
    })

    socket.onClose(() => {
      this.#dropped()
    })
    socket.onError(() => {
      this.#dropped()
    })
  }

  /** Closes the connection and stops reconnecting. The document is left alone. */
  destroy(): void {
    this.#stopped = true
    this.#doc.off('update', this.#onDocUpdate)
    this.#awareness.off('update', this.#onAwarenessUpdate)
    if (this.#retryHandle !== null) this.#clearTimer(this.#retryHandle)
    this.#retryHandle = null
    this.#closeSocket()
    this.#setStatus('offline')
  }

  readonly #onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    // A change the room just sent us must not be sent straight back to it.
    if (origin === FROM_ROOM) return
    this.#send(encodeUpdate(update))
  }

  readonly #onAwarenessUpdate = (changes: AwarenessChanges, origin: unknown): void => {
    if (origin === FROM_ROOM) return
    const changed = [...changes.added, ...changes.updated, ...changes.removed]
    if (changed.length === 0) return
    this.#send(encodeAwareness(this.#awareness, changed))
  }

  #send(message: Uint8Array): void {
    if (this.#socket === null || this.#status !== 'connected') return
    try {
      this.#socket.send(message)
    } catch {
      // The close handler owns reconnection; a failed send is just an early
      // symptom of a connection that has already gone.
      this.#dropped()
    }
  }

  #dropped(): void {
    if (this.#stopped) return
    this.#closeSocket()
    this.#setStatus('connecting')

    /*
     * Backoff with jitter. Without the jitter, everyone editing a board when a
     * room restarts reconnects on the same millisecond, and the room's first
     * act on coming back is to be knocked over again by its own users.
     */
    const wait = this.#retryMs * (0.5 + Math.random() / 2)
    this.#retryMs = Math.min(this.#retryMs * 2, MAX_RETRY_MS)
    this.#retryHandle = this.#setTimer(() => {
      this.#retryHandle = null
      this.start()
    }, wait)
  }

  #closeSocket(): void {
    const socket = this.#socket
    this.#socket = null
    if (socket === null) return
    try {
      socket.close()
    } catch {
      // Already gone.
    }
  }

  #setStatus(status: ConnectionStatus): void {
    if (this.#status === status) return
    this.#status = status
    this.#onStatus(status)
  }
}

interface AwarenessChanges {
  readonly added: number[]
  readonly updated: number[]
  readonly removed: number[]
}
