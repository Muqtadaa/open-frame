import {
  connectBoard,
  roomSocketUrl,
  type BoardConnection,
  type RoomCredentials,
  type RoomRole,
  type RoomSocket,
} from '@openframe/collab'
import {
  CommandDispatcher,
  createDefaultRegistry,
  createDocumentStore,
  createEmptyDocument,
  createIdGenerator,
  readOnlyCapabilities,
  systemClock,
  type BoardId,
  type CommandError,
  type DocumentStore,
  type ObjectTypeRegistry,
} from '@openframe/core'

import { nodeRoomSocket } from './node-room-socket.js'

/**
 * A board, joined from a process with no browser in it.
 *
 * The whole of stage 1: this is an ORDINARY peer. It speaks the protocol the
 * web app speaks, to the room the web app connects to, and changes the board
 * through the dispatcher a click goes through. Nothing in `apps/rooms`, in
 * `packages/collab` or in the command layer knows it exists, which is the
 * claim phase 5 was designed around and the thing this proves.
 */

/** How long to wait for the room to send the board before giving up. */
const SYNC_TIMEOUT_MS = 15_000

export interface OpenBoardOptions {
  readonly boardId: BoardId
  /** The room server, as `http(s)://…` or `ws(s)://…`; either is converted. */
  readonly server: string
  /** Which link this peer arrived on, and what else it can prove about itself. */
  readonly credentials?: RoomCredentials
  readonly onError?: (error: CommandError) => void
  /**
   * How long to wait for the board. A room that never answers is a connection
   * problem, not an empty board, and the difference has to reach the caller.
   */
  readonly syncTimeoutMs?: number
  /**
   * Opens the socket. Injected ONLY so the suite can run a peer against a real
   * room in one process, exactly as `packages/collab` tests the provider —
   * every other caller wants the Node socket this defaults to.
   */
  readonly connect?: (url: string) => RoomSocket
}

export interface BoardPeer {
  readonly boardId: BoardId
  /** The board, as it stands. Read-only: `store` has no writer on it. */
  readonly store: DocumentStore
  /**
   * The one way this process changes the board.
   *
   * Every rule about the dispatcher holds here unchanged — validation,
   * authorization, one undo entry per dispatch, an origin on the envelope.
   * Stage 4's tools are callers of this and nothing more.
   */
  readonly dispatcher: CommandDispatcher
  /** What the ROOM decided this connection may do, not what it asked for. */
  readonly role: RoomRole
  /**
   * What each type on this board can say about itself.
   *
   * Handed out rather than rebuilt by the caller, for the reason rule 5 gives:
   * the registry is where behaviour lives, and a tool that built its own would
   * be a second answer to "what is this object" the moment a type changed.
   */
  readonly registry: ObjectTypeRegistry
  close(): void
}

/**
 * Joins a board's room and comes back when the board is actually there.
 *
 * Not when the socket opens. `connected` is a round trip early, and a peer
 * that read the document then would read the empty one it started with and
 * report an empty board — the failure mode that matters most here, because it
 * looks like an answer rather than an error.
 */
export async function openBoard(options: OpenBoardOptions): Promise<BoardPeer> {
  const { boardId } = options
  const registry = createDefaultRegistry()
  const ids = createIdGenerator()

  /*
   * Empty, and it stays empty until the room fills it. This process has no
   * board of its own — `seed: false` is what stops it publishing one, which
   * would set the room's title to whatever an empty document is called.
   */
  const { store, writer } = createDocumentStore(
    createEmptyDocument(boardId, 'Untitled board', systemClock.now()),
  )

  /*
   * The ROOM's answer, read at the moment of the check rather than captured.
   * A viewer connection is refused by the room whatever this says — the room
   * re-authorizes every write — but a peer that let a command through and then
   * watched it not stick would report success for work that never happened.
   */
  let role: RoomRole = 'viewer'
  const editing = readOnlyCapabilities()
  const dispatcher = new CommandDispatcher({
    store,
    writer,
    registry,
    clock: systemClock,
    ids,
    capabilities: {
      can: (action, board) => role === 'editor' || editing.can(action, board),
    },
  })

  const open = options.connect ?? nodeRoomSocket
  const connection = await connectBoard({
    store,
    dispatcher,
    seed: false,
    connect: () => open(roomSocketUrl(options.server, boardId, options.credentials ?? {})),
    onError: options.onError ?? (() => undefined),
  })
  /*
   * `onRole` answers immediately with what the connection currently believes
   * and again when the room says otherwise, so there is no window in which
   * this is stale and no second place reading it.
   */
  connection.onRole((next) => {
    role = next
  })

  await synced(connection, options.syncTimeoutMs ?? SYNC_TIMEOUT_MS)

  return {
    boardId,
    store,
    dispatcher,
    registry,
    get role() {
      return role
    },
    /**
     * Stops listening and closes the socket.
     *
     * The PROCESS may still have a little to wait for: `close()` starts a
     * closing handshake and the room does not always answer it — a Durable
     * Object that has let a hibernating socket go has nothing left to answer
     * with — so Node keeps the TCP handle until it times out. Nothing is
     * delivered over it and nothing is listening; a command-line tool that
     * wants to be gone exits rather than waiting for a reply that is not
     * coming.
     */
    close() {
      connection.destroy()
    },
  }
}

/** The board, or an error saying the room never sent one. */
async function synced(connection: BoardConnection, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const stopWaiting = connection.onSynced(() => {
      clearTimeout(timer)
      resolve()
    })
    const timer = setTimeout(() => {
      stopWaiting()
      /*
       * Closed on the way out, because nobody else can: the caller is about to
       * receive an error instead of the peer that owns this connection, and a
       * socket left retrying in the background belongs to nothing.
       */
      connection.destroy()
      reject(new Error(`The room did not send the board within ${String(timeoutMs)}ms`))
    }, timeoutMs)
  })
}
