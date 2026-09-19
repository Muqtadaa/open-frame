import {
  BoardRoom,
  CLOSE_BOARD_DELETED,
  documentFromSnapshot,
  type RoomPeer,
  type RoomRole,
} from '@openframe/collab'
import { DurableObject } from 'cloudflare:workers'

import {
  claimDecision,
  destroyDecision,
  mintKeys,
  roleForKey,
  roleFromAttachment,
  type AccessKeys,
} from './access.js'
import type { Env } from './env.js'

/**
 * One board, as a Durable Object.
 *
 * This class holds three things `@openframe/collab` deliberately knows nothing
 * about: the sockets, the storage, and the fact that any of this is Cloudflare.
 * Every decision — who is told what, whose cursor disappears, what a message
 * means — is in `BoardRoom`, which is why that is where the tests are.
 *
 * WebSocket Hibernation is what makes an idle room free: the runtime keeps the
 * connections open and evicts this object from memory, then rebuilds it when
 * the next message arrives. Everything below follows from that one fact.
 */

/** A merged snapshot of the whole document. */
const SNAPSHOT = 'snapshot'
/** `u:<seq>` — a change since the last snapshot, newest last. */
const UPDATE_PREFIX = 'u:'
/**
 * How many loose updates are allowed before they are merged back into one.
 *
 * Every one of them is read on wake, so the ceiling is really "how much work is
 * a cold start allowed to be". Sixty-four keeps that trivial while making
 * compaction rare.
 */
const COMPACT_AFTER = 64

/**
 * Where a claimed board's two keys live. Absent means a LEGACY room — one
 * shared before links had roles — and `access.ts` explains what that grants.
 */
const KEYS = 'keys'

/**
 * Set once a board has been deleted, and never cleared.
 *
 * Without it a destroyed room is indistinguishable from a brand new one: no
 * keys means `roleForKey` answers `editor` to every link, which is right for a
 * board shared before roles existed and exactly wrong here. Anyone still
 * holding a link would open an empty board with write access and be able to
 * claim it. The links have to DIE with the board, so the room remembers that
 * it was a board and is not one any more.
 *
 * It survives `deleteAll()` by being written after it.
 */
const DESTROYED = 'destroyed'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
} as const

export class BoardRoomObject extends DurableObject<Env> {
  #room!: BoardRoom
  #sequence = 0

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)

    /*
     * `blockConcurrencyWhile` is load-bearing, not caution: without it a
     * hibernated room could take a message before its document came back from
     * storage, and answer a sync step from an empty board — which looks to the
     * client exactly like everyone's work having been deleted.
     */
    void ctx.blockConcurrencyWhile(async () => {
      this.#room = new BoardRoom({
        doc: documentFromSnapshot(await this.#load()),
        onDocumentChanged: (update) => {
          void this.#persist(update)
        },
      })

      /*
       * Sockets outlive this object. After an eviction the connections are
       * still open and their clients have no idea anything happened, so they
       * are re-joined here — which re-runs the handshake and costs one round
       * trip per socket per wake.
       */
      for (const socket of ctx.getWebSockets()) this.#room.join(this.#peer(socket))
    })
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    const destroyed = (await this.ctx.storage.get<boolean>(DESTROYED)) === true

    if (url.pathname.endsWith('/destroy')) return this.#destroy(request, destroyed)

    /*
     * Checked before anything else looks at keys. A destroyed room has none,
     * and "no keys" means "let everyone in as an editor" everywhere else in
     * this file — which is the legacy rule, and the last thing that should
     * apply to a board somebody deleted.
     */
    if (destroyed) {
      return new Response('This board no longer exists', { status: 410, headers: CORS })
    }

    if (url.pathname.endsWith('/claim')) return this.#claim()

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('This endpoint speaks WebSocket', { status: 426 })
    }

    const role = await this.#roleFor(url.searchParams.get('k'))
    if (role === null) {
      // The same answer for a wrong key and a missing one. Distinguishing them
      // tells somebody probing which half of the guess to keep.
      return new Response('That link does not open this board', { status: 403 })
    }

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]

    /*
     * The peer id is attached to the SOCKET, not held in a field. A field would
     * not survive the next eviction, and the room would then be unable to say
     * whose cursor to remove when this connection closes.
     */
    server.serializeAttachment({ id: crypto.randomUUID(), role })
    // `acceptWebSocket`, never `server.accept()`: the latter opts out of
    // hibernation and keeps the room in memory for as long as anyone is
    // connected, which is the whole cost this was chosen to avoid.
    this.ctx.acceptWebSocket(server)
    this.#room.join(this.#peer(server))

    return new Response(null, { status: 101, webSocket: client })
  }

  override webSocketMessage(socket: WebSocket, message: ArrayBuffer | string): void {
    // Text frames are not part of this protocol. Ignored rather than fatal:
    // a proxy or a stray client should not be able to close a room.
    if (typeof message === 'string') return
    this.#room.receive(this.#peer(socket), new Uint8Array(message))
  }

  override webSocketClose(socket: WebSocket): void {
    this.#room.leave(this.#peer(socket))
  }

  override webSocketError(socket: WebSocket): void {
    this.#room.leave(this.#peer(socket))
  }

  /** Identity that survives eviction, because it lives on the connection. */
  #peer(socket: WebSocket): RoomPeer {
    const attached = socket.deserializeAttachment() as { id?: string; role?: string } | null
    return {
      id: attached?.id ?? 'unknown',
      role: roleFromAttachment(attached),
      send: (data) => {
        socket.send(data)
      },
    }
  }

  async #roleFor(key: string | null): Promise<RoomRole | null> {
    return roleForKey(await this.ctx.storage.get<AccessKeys>(KEYS), key)
  }

  /** Storage and a response around `claimDecision`, which is where the rule is. */
  async #claim(): Promise<Response> {
    const keys = await this.ctx.storage.get<AccessKeys>(KEYS)
    const snapshot = await this.ctx.storage.get<ArrayBuffer>(SNAPSHOT)
    const updates = await this.ctx.storage.list<ArrayBuffer>({ prefix: UPDATE_PREFIX, limit: 1 })

    const decision = claimDecision(keys, snapshot !== undefined || updates.size > 0)
    if (!decision.ok) {
      return Response.json({ error: decision.error }, { status: decision.status, headers: CORS })
    }

    const minted = mintKeys()
    await this.ctx.storage.put(KEYS, minted)
    return Response.json(minted, { headers: CORS })
  }

  /**
   * Destroys the room and everything in it. The first irreversible thing here.
   *
   * The key is read from the BODY, and a body this cannot parse is treated as
   * no key at all rather than as an error — the answer for a bad key and a
   * missing one is already the same, and adding a third shape of failure only
   * tells somebody probing which part they got wrong.
   */
  async #destroy(request: Request, destroyed: boolean): Promise<Response> {
    const keys = await this.ctx.storage.get<AccessKeys>(KEYS)
    const decision = destroyDecision(keys, await readKey(request), destroyed)
    if (!decision.ok) {
      return Response.json({ error: decision.error }, { status: decision.status, headers: CORS })
    }

    /*
     * Everyone is put out before the room is emptied, not after. A socket left
     * attached would go on talking to a `BoardRoom` whose document is about to
     * be replaced by nothing, and every peer would watch the board empty
     * itself — which looks exactly like the bug this whole file is careful to
     * avoid, except this time it is real and it is permanent.
     */
    for (const socket of this.ctx.getWebSockets()) {
      socket.close(CLOSE_BOARD_DELETED, 'This board was deleted')
    }

    await this.ctx.storage.deleteAll()
    // After, deliberately: `deleteAll` would take it with everything else.
    await this.ctx.storage.put(DESTROYED, true)

    return Response.json({ destroyed: true }, { headers: CORS })
  }

  async #load(): Promise<Uint8Array[]> {
    const snapshot = await this.ctx.storage.get<ArrayBuffer>(SNAPSHOT)
    const updates = await this.ctx.storage.list<ArrayBuffer>({ prefix: UPDATE_PREFIX })
    this.#sequence = updates.size

    /*
     * Replayed in key order, which is why the sequence is zero-padded: `u:10`
     * sorts before `u:9` as a string, and a board rebuilt out of order is a
     * corrupted one.
     */
    const parts: Uint8Array[] = []
    if (snapshot !== undefined) parts.push(new Uint8Array(snapshot))
    for (const value of updates.values()) parts.push(new Uint8Array(value))
    return parts
  }

  /**
   * Writes the change before the handler that caused it returns.
   *
   * Not debounced, and not left to an alarm. Hibernation can evict this object
   * between a message and any later timer, taking unsaved edits with it —
   * losing a user's work is the one unacceptable failure.
   *
   * The reason that is affordable is a Phase 1 decision: nothing is written to
   * the document during a drag, so one write here is one USER ACTION, not one
   * mouse move. A 500-event drag is a single update and a single row.
   */
  async #persist(update: Uint8Array): Promise<void> {
    const key = `${UPDATE_PREFIX}${String(this.#sequence++).padStart(8, '0')}`
    await this.ctx.storage.put(key, bufferOf(update))
    if (this.#sequence >= COMPACT_AFTER) await this.#compact()
  }

  /** Folds the loose updates back into one snapshot, so a cold start stays cheap. */
  async #compact(): Promise<void> {
    const merged = this.#room.snapshot()
    await this.ctx.storage.put(SNAPSHOT, bufferOf(merged))
    await this.ctx.storage.delete([...(await this.ctx.storage.list({ prefix: UPDATE_PREFIX })).keys()])
    this.#sequence = 0
  }
}

/**
 * The key out of a destroy request's body.
 *
 * Every failure — no body, not JSON, not an object, no `key`, a `key` that is
 * not a string — answers `null`, which `destroyDecision` refuses exactly as it
 * refuses a wrong key. One answer for every way of not having the right one.
 */
async function readKey(request: Request): Promise<string | null> {
  try {
    const body: unknown = await request.json()
    if (typeof body !== 'object' || body === null) return null
    const { key } = body as { key?: unknown }
    return typeof key === 'string' ? key : null
  } catch {
    return null
  }
}

function bufferOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
