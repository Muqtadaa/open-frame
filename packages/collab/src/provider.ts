import type * as Y from 'yjs'

import { ServerClock } from './clock.js'
import {
  decodeRole,
  decodeTimeReply,
  encodeAwareness,
  encodeHello,
  encodeSyncStep1,
  encodeTimeRequest,
  encodeUpdate,
  readMessage,
  type Awareness,
  type RoomCredentials,
  type RoomRole,
} from './protocol.js'
import { Assembler, Splitter } from './parts.js'

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
  /**
   * The close CODE matters and is not optional. It is the only thing that
   * separates a board that no longer exists from a connection that blinked,
   * and the two need opposite responses.
   */
  onClose(listener: (code: number) => void): void
  onError(listener: () => void): void
}

/**
 * The room's code for "this board was deleted", sent to everyone on it just
 * before the room empties itself.
 *
 * In the private range, and defined HERE rather than in the Worker so the two
 * ends cannot drift: the side that sends it and the side that must recognise
 * it now read the same constant.
 */
export const CLOSE_BOARD_DELETED = 4004

/**
 * The room's code for "this board has a password and you have not redeemed
 * it", sent instead of any board data.
 *
 * A separate code rather than a refused upgrade: a failed handshake reaches
 * the browser as a generic error and close code 1006, which is
 * indistinguishable from a dropped connection — and "your wifi blinked" is the
 * wrong thing to tell somebody who needs to type a password.
 */
export const CLOSE_PASSWORD_REQUIRED = 4003

/**
 * `gone` and `locked` are TERMINAL. The others are stages of trying; these two
 * mean there is nothing left to try without something changing outside the
 * connection — a room that has been destroyed, or a password nobody has
 * entered yet. Retrying either is a loop with no exit.
 */
export type ConnectionStatus = 'connecting' | 'connected' | 'offline' | 'gone' | 'locked'

export interface RoomProviderOptions {
  readonly doc: Y.Doc
  readonly awareness: Awareness
  /** Opens a new socket. Called again on every reconnection attempt. */
  readonly connect: () => RoomSocket
  /**
   * Who this connection is, sent as its first message (`MESSAGE_HELLO`). Read
   * again for every attempt, so a password unlocked meanwhile is sent next time.
   */
  readonly credentials?: () => RoomCredentials
  readonly onStatus?: (status: ConnectionStatus) => void
  /**
   * What the room decided this connection may do.
   *
   * Reported rather than asked for: the client knows which link it opened, but
   * the room is the only thing that checked it.
   */
  readonly onRole?: (role: RoomRole) => void
  /**
   * The room has answered with the board.
   *
   * Called once, when the first sync message CARRYING CONTENT arrives — which
   * an empty board sends too, so a peer waiting on this is not waiting on
   * there being something to see. `connected` cannot stand in for it: a socket
   * is open a round trip before the document is there, and a headless peer
   * that read the document then would read an empty one and be right about
   * nothing.
   */
  readonly onSynced?: () => void
  /** This device's clock, which the room's is measured against. Injected so tests choose the time. */
  readonly now?: () => number
  /** Injected so tests do not wait in real time. */
  readonly setTimer?: (run: () => void, ms: number) => unknown
  readonly clearTimer?: (handle: unknown) => void
}

/** Backoff, doubling to a ceiling. */
const FIRST_RETRY_MS = 1_000
const MAX_RETRY_MS = 30_000

/** Explicit, so an omitted callback reads as a decision rather than an empty block. */
const noop = (): void => undefined

/**
 * How many times to ask the room the time on connecting. One trip can sit
 * behind the board arriving; the quickest of a few is a fair reading.
 */
const CLOCK_QUESTIONS_ON_OPEN = 3

/** The origin marking changes that came from the room, so they are not echoed back. */
const FROM_ROOM = 'room'

export class RoomProvider {
  readonly #doc: Y.Doc
  readonly #awareness: Awareness
  readonly #connect: () => RoomSocket
  readonly #credentials: () => RoomCredentials
  readonly #onStatus: (status: ConnectionStatus) => void
  readonly #onRole: (role: RoomRole) => void
  readonly #onSynced: () => void
  readonly #setTimer: (run: () => void, ms: number) => unknown
  readonly #clearTimer: (handle: unknown) => void
  readonly #now: () => number
  readonly #clock = new ServerClock()
  readonly #clockListeners = new Set<() => void>()
  /** A board too large for one frame goes, and comes, in parts (`parts.ts`). */
  readonly #splitter = new Splitter()

  #socket: RoomSocket | null = null
  #status: ConnectionStatus = 'offline'
  #retryMs = FIRST_RETRY_MS
  #retryHandle: unknown = null
  #stopped = false
  /**
   * Editor until the room says otherwise, which it does before any document
   * bytes. The optimistic default is safe here and only here: this value drives
   * what the interface OFFERS, and the room enforces the truth regardless.
   */
  #role: RoomRole = 'editor'
  /**
   * Whether the room has sent the board.
   *
   * Latched rather than reset on a reconnection: the document is in hand from
   * then on, and a peer that had it does not stop having it because a socket
   * blinked.
   */
  #synced = false

  constructor(options: RoomProviderOptions) {
    this.#doc = options.doc
    this.#awareness = options.awareness
    this.#connect = options.connect
    this.#credentials = options.credentials ?? (() => ({}))
    this.#onStatus = options.onStatus ?? noop
    this.#onRole = options.onRole ?? noop
    this.#onSynced = options.onSynced ?? noop
    this.#now = options.now ?? (() => Date.now())
    this.#setTimer = options.setTimer ?? ((run, ms) => setTimeout(run, ms))
    this.#clearTimer =
      options.clearTimer ??
      ((handle) => {
        clearTimeout(handle as ReturnType<typeof setTimeout>)
      })

    this.#doc.on('update', this.#onDocUpdate)
    this.#awareness.on('update', this.#onAwarenessUpdate)
  }

  get status(): ConnectionStatus {
    return this.#status
  }

  get role(): RoomRole {
    return this.#role
  }

  get synced(): boolean {
    return this.#synced
  }

  /** Whether the room has said what time it is. A room too old to answer never does. */
  get clockSynced(): boolean {
    return this.#clock.synced
  }

  /** The room's time: this device's clock, corrected by what the room has said. */
  serverNow(): number {
    return this.#now() + this.#clock.offset
  }

  /**
   * Asks the room the time again — after the page was hidden, say, when the
   * device may have slept and its clock been corrected. Ignored while offline.
   */
  syncClock(): void {
    this.#send(encodeTimeRequest(this.#now()))
  }

  /** Called whenever the room answers a question about the time. */
  onClock(listener: () => void): () => void {
    this.#clockListeners.add(listener)
    return () => this.#clockListeners.delete(listener)
  }

  /** Opens the connection, and keeps reopening it until `destroy` is called. */
  start(): void {
    if (this.#stopped || this.#socket !== null) return
    this.#setStatus('connecting')

    const socket = this.#connect()
    this.#socket = socket
    // One per connection: parts never span a reconnect.
    const assembler = new Assembler()
    const send = (message: Uint8Array): void => {
      for (const frame of this.#splitter.split(message)) socket.send(frame)
    }

    /*
     * The hello first, and nothing else until the room answers with a role.
     * The room admits a socket only once it has read the credentials, and
     * anything else sent before then would close it. Waiting for the answer
     * rather than counting on the room to read in order means no message is
     * ever sent that the room must ignore.
     */
    socket.onOpen(() => {
      socket.send(encodeHello(this.#credentials()))
    })

    let admitted = false
    const admit = (): void => {
      admitted = true
      this.#setStatus('connected')
      this.#retryMs = FIRST_RETRY_MS

      /*
       * The client opens with its OWN step 1, and this is the half of the
       * handshake that fetches the board. The room sends its step 1 too; each
       * one asks for a different direction of the diff, so a client that only
       * answers the room's sits on an empty board while the room holds the real
       * one. Two tests in room.test.ts failed exactly that way.
       */
      send(encodeSyncStep1(this.#doc))

      // And announce ourselves, so the people already here see a cursor.
      const local = this.#awareness.getLocalState()
      if (local !== null) send(encodeAwareness(this.#awareness, [this.#doc.clientID]))

      for (let asked = 0; asked < CLOCK_QUESTIONS_ON_OPEN; asked += 1) this.syncClock()
    }

    socket.onMessage((frame) => {
      const heard = assembler.receive(frame)
      if (heard.kind === 'part') return
      if (heard.kind === 'bad') {
        // Lost its place in a message from the room: start the connection again.
        this.#dropped()
        return
      }
      const data = heard.message
      const role = decodeRole(data)
      if (role !== null) {
        this.#role = role
        this.#onRole(role)
        // The role is the room saying it read the hello and let us in.
        if (!admitted) admit()
        return
      }

      const time = decodeTimeReply(data)
      if (time !== null) {
        if (this.#clock.add(time.sentAt, time.roomNow, this.#now())) {
          for (const listener of [...this.#clockListeners]) listener()
        }
        return
      }

      /*
       * `true`, because on this side the peer IS the room. The write guard in
       * `readMessage` is about what a CLIENT may send to a room; a client that
       * refused what the room sent it would be refusing the board.
       */
      const { reply, content } = readMessage(this.#doc, this.#awareness, data, FROM_ROOM, true)
      if (reply !== null) send(reply)

      /*
       * `content` rather than `broadcast`: presence fans out too, and a room
       * announces its own awareness state on every join — so a peer reading
       * the board's arrival off `broadcast` was told the board was here before
       * it had asked for it.
       */
      if (content && !this.#synced) {
        this.#synced = true
        this.#onSynced()
      }
    })

    socket.onClose((code) => {
      /*
       * The board is gone, so this is not a reconnection problem. Retrying
       * here is a loop with no exit: the room refuses every attempt with 410,
       * the refusal closes the socket, and the backoff schedules another —
       * which is exactly what a member saw after an owner deleted a board
       * under them, with nothing on screen to say why.
       */
      if (code === CLOSE_BOARD_DELETED) {
        this.#stop('gone')
        return
      }
      /*
       * Also terminal, but recoverable by a person rather than by waiting:
       * reconnecting without the token is refused identically every time, so
       * the retry loop would spin until somebody types the password. The
       * interface asks, and the board is reopened with the token.
       */
      if (code === CLOSE_PASSWORD_REQUIRED) {
        this.#stop('locked')
        return
      }
      this.#dropped()
    })
    socket.onError(() => {
      this.#dropped()
    })
  }

  /** Closes the connection and stops reconnecting. The document is left alone. */
  destroy(): void {
    this.#stopped = true
    this.#clockListeners.clear()
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
      for (const frame of this.#splitter.split(message)) this.#socket.send(frame)
    } catch {
      // The close handler owns reconnection; a failed send is just an early
      // symptom of a connection that has already gone.
      this.#dropped()
    }
  }

  /** Stops for good. Same shutdown as `destroy`, with a status that explains it. */
  #stop(status: ConnectionStatus): void {
    this.#stopped = true
    if (this.#retryHandle !== null) this.#clearTimer(this.#retryHandle)
    this.#retryHandle = null
    this.#closeSocket()
    this.#setStatus(status)
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
