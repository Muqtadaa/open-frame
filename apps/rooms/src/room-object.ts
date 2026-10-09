import {
  BoardRoom,
  CLOSE_BOARD_DELETED,
  CLOSE_PASSWORD_REQUIRED,
  decodeHello,
  documentFromSnapshot,
  type Hello,
  type RoomPeer,
  type RoomRole,
} from '@openframe/collab'
import { versionName } from '@openframe/core/history'
import { DurableObject } from 'cloudflare:workers'

import {
  claimDecision,
  destroyDecision,
  isOwnerKey,
  setPasswordDecision,
  unlockDecision,
  protectionDecision,
  readDecision,
  keepVersionDecision,
  mintKey,
  mintKeys,
  roleForKey,
  admittedRole,
  pendingTooLong,
  roleFromAttachment,
  type AccessKeys,
} from './access.js'
import {
  afterFailedUnlock,
  isPassword,
  newVerifier,
  tokenAdmits,
  unlockAllowed,
  type PasswordVerifier,
  type UnlockThrottle,
} from './password.js'
import { assetDecision, assetKey, checkUpload, purgeBoardAssets } from './assets.js'
import { readBounded } from './body.js'
import { DocumentStore } from './document-store.js'
import { RoomHistory, timingFrom } from './history.js'
import { InFlight } from './in-flight.js'
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
/**
 * Set when the owner has asked for the board to be deleted and its images are
 * still being removed from R2. Cleared with everything else once they are.
 *
 * From this moment the board is going: no new socket, no new upload, no read.
 * An upload let in now could land AFTER the bucket was swept and outlive the
 * board. But the keys are kept until the sweep has finished, because a sweep
 * that fails part-way has to be retried by the owner — and a room that has
 * already forgotten who its owner is cannot tell who is asking.
 */
const DELETING = 'deleting'
/**
 * The board's password verifier, or absent for a board without one.
 *
 * Absent is the overwhelmingly common case and means "the link is enough",
 * which is what every board did before this existed and what they go on doing
 * unless somebody asks otherwise.
 */
const PASSWORD = 'password'
/**
 * Recent wrong passwords and the wait they have earned (`password.ts`). Absent
 * when nobody has failed lately, which is almost always.
 */
const UNLOCK_THROTTLE = 'unlock-throttle'
/**
 * Which board this room is. An alarm arrives with no request to read it from,
 * and the board's versions are kept under its id, so the first request
 * writes it down.
 */
const BOARD_ID = 'board-id'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
} as const

export class BoardRoomObject extends DurableObject<Env> {
  #room!: BoardRoom
  /** Where the board is kept, in values the platform will hold (`document-store.ts`). */
  readonly #document: DocumentStore
  /** Uploads admitted and not yet in R2, which a destroy waits for. */
  readonly #uploads = new InFlight()
  /** The board's earlier versions (ADR 0019). */
  #history!: RoomHistory
  #knownBoardId: string | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.#document = new DocumentStore(ctx.storage, () => this.#room.snapshot())

    /*
     * `blockConcurrencyWhile` is load-bearing, not caution: without it a
     * hibernated room could take a message before its document came back from
     * storage, and answer a sync step from an empty board — which looks to the
     * client exactly like everyone's work having been deleted.
     */
    this.#history = new RoomHistory({
      storage: ctx.storage,
      bucket: env.ASSETS,
      boardId: () => this.#storedBoardId(),
      snapshot: () => this.#room.snapshot(),
      going: () => this.#going(),
      track: (write) => this.#uploads.track(write),
      timing: timingFrom(env.HISTORY_TIMING),
    })

    void ctx.blockConcurrencyWhile(async () => {
      this.#room = new BoardRoom({
        doc: documentFromSnapshot(await this.#document.load()),
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
      for (const socket of ctx.getWebSockets()) {
        /*
         * A socket that has not said who it is is not re-joined: joining sends
         * the board. One that has waited longer than any client would is
         * closed here rather than by a timer, which would keep the room awake
         * (rule 29).
         */
        if (this.#pending(socket)) {
          if (pendingTooLong(socket.deserializeAttachment())) {
            socket.close(1008, 'Introduce yourself first')
          }
          continue
        }
        this.#room.join(this.#peer(socket))
      }
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
    if (destroyed || (await this.ctx.storage.get<boolean>(DELETING)) === true) {
      return new Response('This board no longer exists', { status: 410, headers: CORS })
    }

    if (url.pathname.includes('/asset/')) return this.#asset(request, url)
    if (url.pathname.includes('/versions')) return this.#versions(request, url)

    if (url.pathname.endsWith('/claim')) return this.#claim()
    if (url.pathname.endsWith('/password')) return this.#setPassword(request)
    if (url.pathname.endsWith('/unlock')) return this.#unlock(request)
    if (url.pathname.endsWith('/owner')) return this.#adoptOwner(request)
    if (url.pathname.endsWith('/protection')) return this.#protection(request)

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('This endpoint speaks WebSocket', { status: 426 })
    }

    /*
     * An address carrying a credential is an older client. The Worker refuses
     * it before it gets here (`route.ts`); this is the same refusal for a
     * request that reached the object some other way.
     */
    if (['k', 't', 'o'].some((param) => url.searchParams.has(param))) {
      return new Response('Update this page to open the board', { status: 400 })
    }

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]

    /*
     * ACCEPTED, NOT ADMITTED. The socket says who it is in its first message
     * (`MESSAGE_HELLO`), because its address is written down by every log on
     * the way here; until then it is a connection that has been told nothing
     * and can do nothing. `#admit` decides, from the hello, exactly what this
     * used to decide from the query string.
     *
     * The peer id and the board's name are attached to the SOCKET, not held
     * in a field, so both survive an eviction between the upgrade and the
     * hello. `at` lets a wake close one that never said anything.
     */
    server.serializeAttachment({
      id: crypto.randomUUID(),
      pending: true,
      at: Date.now(),
      board: this.#boardId(url),
    })
    // `acceptWebSocket`, never `server.accept()`: the latter opts out of
    // hibernation and keeps the room in memory for as long as anyone is
    // connected, which is the whole cost this was chosen to avoid.
    this.ctx.acceptWebSocket(server)

    return new Response(null, { status: 101, webSocket: client })
  }

  /**
   * A socket's first message: who it is. Checked in the order the upgrade
   * used to check the address — the link, then the password — with the same
   * answers, given now as close codes on a socket that is already open.
   */
  async #admit(socket: WebSocket, message: ArrayBuffer | string): Promise<void> {
    let hello: Hello | null = null
    if (typeof message !== 'string') {
      try {
        hello = decodeHello(new Uint8Array(message))
      } catch {
        hello = null
      }
    }
    // Anything but a hello first is a client that does not speak this protocol.
    if (hello === null) {
      socket.close(1008, 'Introduce yourself first')
      return
    }

    if (
      (await this.ctx.storage.get<boolean>(DESTROYED)) === true ||
      (await this.ctx.storage.get<boolean>(DELETING)) === true
    ) {
      socket.close(CLOSE_BOARD_DELETED, 'This board was deleted')
      return
    }

    const role = await this.#roleFor(hello.key)
    if (role === null) {
      // The same answer for a wrong key and a missing one. Distinguishing them
      // tells somebody probing which half of the guess to keep. Not terminal:
      // the client retries, as it did after the 403 this used to be.
      socket.close(1008, 'That link does not open this board')
      return
    }

    /*
     * THE SECOND FACTOR, if this board has one. Checked after the link, so a
     * connection without a valid key learns nothing about whether the board is
     * protected.
     *
     * THE OWNER IS NEVER ASKED. They are the one who set the password, and a
     * board that locks out the person whose board it is — on a new machine, or
     * after they have forgotten it — is a board they have lost.
     */
    const verifier = await this.ctx.storage.get<PasswordVerifier>(PASSWORD)
    const owner = isOwnerKey(await this.ctx.storage.get<AccessKeys>(KEYS), hello.ownerKey)
    if (!owner && !tokenAdmits(verifier, hello.token)) {
      socket.close(CLOSE_PASSWORD_REQUIRED, 'This board needs its password')
      return
    }

    const attached = socket.deserializeAttachment() as { id?: string; board?: string } | null
    /*
     * Only once somebody who can change the board is let in: an edit is what
     * a version needs the id for, and writing it on any request would let
     * anyone leave a row in a room by naming one.
     */
    if (role === 'editor' && typeof attached?.board === 'string') {
      await this.#rememberBoardId(new URL(`https://room/room/${attached.board}`))
    }
    socket.serializeAttachment({ id: attached?.id ?? crypto.randomUUID(), role })
    this.#room.join(this.#peer(socket))
  }

  override async webSocketMessage(socket: WebSocket, message: ArrayBuffer | string): Promise<void> {
    // Not yet admitted: this is its hello, or it is closed.
    if (this.#pending(socket)) {
      await this.#admit(socket, message)
      return
    }
    // Text frames are not part of this protocol. Ignored rather than fatal:
    // a proxy or a stray client should not be able to close a room.
    if (typeof message === 'string') return
    const peer = this.#peer(socket)
    const received = this.#room.receive(peer, new Uint8Array(message))
    if (received === 'accepted') return
    /*
     * The sender's connection goes, and nobody else's. The standard codes, so
     * the client's ordinary reconnect handles it: a bad frame from a buggy
     * build is not a reason to stop retrying, and a deliberate one is not
     * worth a code of its own.
     */
    this.#room.leave(peer)
    if (received === 'too-large') socket.close(1009, 'Message too large')
    else socket.close(1007, 'Message could not be read')
  }

  override webSocketClose(socket: WebSocket): void {
    this.#room.leave(this.#peer(socket))
  }

  override webSocketError(socket: WebSocket): void {
    this.#room.leave(this.#peer(socket))
  }

  /** Whether a socket has yet to say who it is. */
  #pending(socket: WebSocket): boolean {
    return admittedRole(socket.deserializeAttachment() as { pending?: unknown } | null) === null
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

  /**
   * One image on this board: read it, or put it there.
   *
   * The DECISION is in `assets.ts`, which is values in and a verdict out, so
   * the rule about who can see every picture anybody has put on a board can be
   * run in Node. What is left here is storage and a response — the same split
   * as `claimDecision`, and for the same reason.
   */
  async #asset(request: Request, url: URL): Promise<Response> {
    const assetId = url.pathname.split('/asset/')[1]?.replace(/\/$/, '') ?? ''
    if (assetId === '') return new Response('Not found', { status: 404, headers: CORS })

    const keys = await this.ctx.storage.get<AccessKeys>(KEYS)
    const verifier = await this.ctx.storage.get<PasswordVerifier>(PASSWORD)
    const owner = isOwnerKey(keys, request.headers.get('x-openframe-owner'))

    const decision = assetDecision({
      method: request.method,
      role: roleForKey(keys, request.headers.get('x-openframe-key')),
      owner,
      unlocked: tokenAdmits(verifier, request.headers.get('x-openframe-token')),
      contentType: request.headers.get('content-type'),
      contentLength: Number(request.headers.get('content-length') ?? Number.NaN),
    })

    if (!decision.ok) {
      return new Response(decision.reason, { status: decision.status, headers: CORS })
    }

    const key = assetKey(this.#boardId(url), assetId)

    if (decision.write) {
      /*
       * The bytes are read and checked BEFORE anything reaches the bucket: the
       * declared type and length are claims, and the browser's own check binds
       * nobody who skips the browser. Read and write are tracked as one, since
       * reading the body is not storage I/O either and a destroy can begin
       * while it is under way.
       */
      const contentType = decision.contentType
      const declared = Number(request.headers.get('content-length'))
      const stored = await this.#uploads.track(
        (async () => {
          const upload = await checkUpload(contentType, declared, request.body)
          if (!upload.ok) return upload
          await this.env.ASSETS.put(key, upload.bytes, { httpMetadata: { contentType } })
          return upload
        })(),
      )
      if (!stored.ok) {
        return new Response(stored.reason, { status: stored.status, headers: CORS })
      }
      /*
       * R2 lets other requests run while this one waits on it, so the board
       * may have started going in the meantime. A destroy drains uploads it
       * can see before sweeping; this covers the one it could not, by taking
       * the image back out rather than leaving it to outlive the board.
       */
      if (await this.#going()) {
        await this.env.ASSETS.delete(key)
        return new Response('This board no longer exists', { status: 410, headers: CORS })
      }
      return new Response(null, { status: 204, headers: CORS })
    }

    const object = await this.env.ASSETS.get(key)
    if (object === null) return new Response('No such image', { status: 404, headers: CORS })

    return new Response(object.body, {
      headers: {
        ...CORS,
        'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
        /*
         * An image is immutable — its id is minted per upload — so it can be
         * cached hard. `nosniff` because the type is whatever the uploader
         * declared, checked against an allowlist but never re-derived from the
         * bytes.
         */
        'cache-control': 'private, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      },
    })
  }

  /**
   * The board's history: the list of its versions, or one version's bytes.
   *
   * Read by the same rule as an image (`readDecision`), because a version is
   * the board as it was and anyone who may open the board may see what it
   * was. Restoring one is an EDIT, made by an editor's own client through the
   * command layer and the socket like any other — nothing here writes.
   */
  async #versions(request: Request, url: URL): Promise<Response> {
    const keys = await this.ctx.storage.get<AccessKeys>(KEYS)
    const verifier = await this.ctx.storage.get<PasswordVerifier>(PASSWORD)
    const caller = {
      role: roleForKey(keys, request.headers.get('x-openframe-key')),
      owner: isOwnerKey(keys, request.headers.get('x-openframe-owner')),
      unlocked: tokenAdmits(verifier, request.headers.get('x-openframe-token')),
    }

    /*
     * The writes, both an editor's: keeping the board as it is now — just
     * before a restore, so what is replaced is kept too, or under a name —
     * and deleting a named version. The restore itself is an ordinary edit
     * through the socket.
     */
    if (request.method === 'POST' || request.method === 'DELETE') {
      /*
       * The body is read before anything is decided: the runtime errors on a
       * request stream still open once the response has gone. A name is at
       * most eighty characters, so the read stops at a few kilobytes,
       * whatever the request claims its length is (Codex, on #85).
       */
      const body = request.method === 'POST' ? await readNamed(request) : { named: false as const }
      if (body === TOO_LONG) return new Response('Too long', { status: 413, headers: CORS })
      const keep = keepVersionDecision(caller)
      if (!keep.ok) return new Response(keep.reason, { status: keep.status, headers: CORS })

      if (request.method === 'DELETE') {
        const id = url.pathname.split('/versions/')[1]?.replace(/\/$/, '') ?? ''
        const forgotten = await this.#history.forget(id)
        return forgotten === 'deleted'
          ? new Response(null, { status: 204, headers: CORS })
          : forgotten === 'automatic'
            ? new Response('Only a named version can be deleted', { status: 409, headers: CORS })
            : new Response('No such version', { status: 404, headers: CORS })
      }

      /*
       * With a name, a named version of the board as it is now (ADR 0019);
       * without one, the board kept before a restore. The name is checked by
       * the same rule the browser applies, so neither keeps one the other
       * would refuse.
       */
      if (body.named) {
        const name = versionName(body.name)
        if (name === null) {
          return new Response('That is not a name a version can have', {
            status: 400,
            headers: CORS,
          })
        }
        const record = await this.#history.name(name)
        return record === null
          ? Response.json({ named: false }, { status: 503, headers: CORS })
          : Response.json({ version: record }, { headers: CORS })
      }
      const kept = await this.#history.keepNow()
      return kept
        ? Response.json({ kept: true }, { headers: CORS })
        : Response.json({ kept: false }, { status: 503, headers: CORS })
    }

    const decision = readDecision(caller)
    if (!decision.ok) {
      return new Response(decision.reason, { status: decision.status, headers: CORS })
    }

    const versionId = url.pathname.split('/versions/')[1]?.replace(/\/$/, '')
    if (versionId === undefined || versionId === '') {
      return Response.json(
        { versions: await this.#history.list() },
        { headers: { ...CORS, 'cache-control': 'no-store' } },
      )
    }

    const bytes = await this.#history.read(versionId)
    if (bytes === null) return new Response('No such version', { status: 404, headers: CORS })
    return new Response(bytes, {
      headers: {
        ...CORS,
        // Gzipped Yjs, which the client opens itself — not `content-encoding`,
        // which a proxy along the way is free to undo or redo.
        'content-type': 'application/octet-stream',
        // A version never changes once taken; its id names it for good.
        'cache-control': 'private, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      },
    })
  }

  /**
   * Wakes the room to take a version once editing has settled, and to thin
   * the ones retention no longer keeps (`history.ts`). The only alarm this
   * room sets.
   */
  override async alarm(): Promise<void> {
    await this.#history.alarm()
  }

  async #rememberBoardId(url: URL): Promise<void> {
    if (this.#knownBoardId !== null) return
    const boardId = this.#boardId(url)
    if (boardId === '') return
    const stored = await this.ctx.storage.get<string>(BOARD_ID)
    if (stored === undefined) await this.ctx.storage.put(BOARD_ID, boardId)
    this.#knownBoardId = stored ?? boardId
  }

  /**
   * The board's id: as stored, or else the name the Worker reached this room
   * by. The fallback is for a socket that was open before this was deployed
   * and is restored from hibernation without ever passing through `fetch` —
   * its edits still need somewhere to file a version.
   */
  async #storedBoardId(): Promise<string | null> {
    this.#knownBoardId ??=
      (await this.ctx.storage.get<string>(BOARD_ID)) ?? this.ctx.id.name ?? null
    return this.#knownBoardId
  }

  /** Whether the board is being deleted or already has been. */
  async #going(): Promise<boolean> {
    const [deleting, destroyed] = await Promise.all([
      this.ctx.storage.get<boolean>(DELETING),
      this.ctx.storage.get<boolean>(DESTROYED),
    ])
    return deleting === true || destroyed === true
  }

  /** The board this room is, taken from the path it was reached by. */
  #boardId(url: URL): string {
    return url.pathname.split('/')[2] ?? ''
  }

  async #roleFor(key: string | null): Promise<RoomRole | null> {
    return roleForKey(await this.ctx.storage.get<AccessKeys>(KEYS), key)
  }

  /** Storage and a response around `claimDecision`, which is where the rule is. */
  async #claim(): Promise<Response> {
    const keys = await this.ctx.storage.get<AccessKeys>(KEYS)
    const decision = claimDecision(keys, await this.#document.holdsBoard())
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
   *
   * THE ORDER is what makes a failure recoverable rather than a lie:
   *
   * 1. Mark the board as going, so nothing new reaches it — above all no
   *    upload that could land in the bucket after it was swept.
   * 2. Put everyone out.
   * 3. Sweep its images out of R2.
   * 4. Only then forget the document and the keys.
   *
   * If the sweep fails the answer is 503 and the keys are still here, so the
   * owner's retry is authorized exactly as the first attempt was and finishes
   * the job. Forgetting the keys first would leave bytes nobody could ever be
   * trusted to delete.
   */
  async #destroy(request: Request, destroyed: boolean): Promise<Response> {
    const keys = await this.ctx.storage.get<AccessKeys>(KEYS)
    const decision = destroyDecision(keys, await readKey(request), destroyed)
    if (!decision.ok) {
      return Response.json(
        { error: decision.error, ...(decision.needsOwner ? { needsOwner: true } : {}) },
        { status: decision.status, headers: CORS },
      )
    }

    await this.ctx.storage.put(DELETING, true)

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

    // Uploads admitted before the marker may still be on their way to R2,
    // and one that lands after the sweep would outlive the board.
    await this.#uploads.drain()

    const purged = await purgeBoardAssets(this.env.ASSETS, this.#boardId(new URL(request.url)))
    if (!purged.ok) {
      return Response.json(
        { error: 'The board’s images could not all be deleted. Try again.', retriable: true },
        { status: 503, headers: CORS },
      )
    }

    // An alarm left set would wake a deleted room to version nothing.
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
    // After, deliberately: `deleteAll` would take it with everything else.
    await this.ctx.storage.put(DESTROYED, true)

    return Response.json({ destroyed: true }, { headers: CORS })
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
  /**
   * Sets, changes or clears the board's password.
   *
   * Clearing and setting are the same request with a different body, because
   * they are the same decision — who may change how this board is reached —
   * and splitting them would mean authorizing the same thing twice in two
   * places. A null password removes the verifier and with it the token, so
   * clearing also shuts out every browser that had unlocked it.
   */
  async #setPassword(request: Request): Promise<Response> {
    const keys = await this.ctx.storage.get<AccessKeys>(KEYS)
    const body = await readBody(request)
    const destroyed = (await this.ctx.storage.get<boolean>(DESTROYED)) === true

    const decision = setPasswordDecision(keys, body.key, destroyed)
    if (!decision.ok) {
      return Response.json({ error: decision.error }, { status: decision.status, headers: CORS })
    }

    /*
     * A new password, or none, is a fresh start: guesses at the old one are
     * not held against anybody trying the new one. Only once it has actually
     * changed — a refused change leaves the old password in force, and
     * forgiving the guesses at it would hand out a fresh set of free tries.
     */
    if (body.password === null) {
      await this.ctx.storage.delete(PASSWORD)
      await this.ctx.storage.delete(UNLOCK_THROTTLE)
      return Response.json({ password: false }, { headers: CORS })
    }

    /*
     * A password nobody could type is not protection. The floor is deliberately
     * low — this is a second factor on a link that is already a 128-bit secret,
     * not a credential standing alone — but empty and whitespace must not pass,
     * because both look to the person setting them like they did something.
     */
    if (body.password.trim().length < 4) {
      return Response.json(
        { error: 'A password needs at least four characters' },
        { status: 400, headers: CORS },
      )
    }

    const verifier = await newVerifier(body.password)
    await this.ctx.storage.put(PASSWORD, verifier)
    await this.ctx.storage.delete(UNLOCK_THROTTLE)
    // The token is NOT returned here. Setting a password is not unlocking one:
    // the browser that set it redeems it like everybody else, which is also
    // the only way that path is ever exercised by the person who chose it.
    return Response.json({ password: true }, { headers: CORS })
  }

  /**
   * Gives a board claimed before owner keys existed one, once.
   *
   * Authorized by the EDIT key, which is the strongest thing such a board has
   * — there is no owner key yet for anyone to hold. It is self-closing: the
   * moment a key exists this stops minting, and only the holder of that key
   * can read it back. Whoever adopts first is therefore the owner as far as
   * this room is concerned, which is why the owner's own client adopts as soon
   * as it needs owner authority (a password, a delete) rather than waiting.
   *
   * Idempotent for the owner, so a client that lost its copy can ask again
   * rather than being told the board is broken.
   */
  async #adoptOwner(request: Request): Promise<Response> {
    const keys = await this.ctx.storage.get<AccessKeys>(KEYS)
    const key = await readKey(request)
    const destroyed = (await this.ctx.storage.get<boolean>(DESTROYED)) === true

    if (destroyed) {
      return Response.json({ error: 'This board no longer exists' }, { status: 410, headers: CORS })
    }
    if (keys === undefined) {
      return Response.json(
        { error: 'This board was shared before links had roles' },
        { status: 409, headers: CORS },
      )
    }

    if (keys.owner !== undefined) {
      // Already adopted. Only the owner gets it back — handing it to an edit
      // link here would undo the whole distinction one line after making it.
      if (!isOwnerKey(keys, key)) {
        return Response.json(
          { error: 'Only the board’s owner can do that' },
          { status: 403, headers: CORS },
        )
      }
      return Response.json({ owner: keys.owner }, { headers: CORS })
    }

    if (key === null || key !== keys.editor) {
      return Response.json(
        { error: 'That link does not open this board' },
        { status: 403, headers: CORS },
      )
    }

    const owner = mintKey()
    await this.ctx.storage.put(KEYS, { ...keys, owner })
    return Response.json({ owner }, { headers: CORS })
  }

  /**
   * Whether this board has a password, for the front door's list.
   *
   * The key is read from the body, like every other key this room is handed
   * outside a socket: a credential in a URL is a credential in an access log.
   */
  async #protection(request: Request): Promise<Response> {
    const keys = await this.ctx.storage.get<AccessKeys>(KEYS)
    const body = await readBody(request)
    const decision = protectionDecision(keys, body.key)
    if (!decision.ok) {
      return Response.json({ error: decision.error }, { status: decision.status, headers: CORS })
    }
    const verifier = await this.ctx.storage.get<PasswordVerifier>(PASSWORD)
    return Response.json({ password: verifier !== undefined }, { headers: CORS })
  }

  /** Trades the password for the token that opens the board. */
  async #unlock(request: Request): Promise<Response> {
    const keys = await this.ctx.storage.get<AccessKeys>(KEYS)
    const verifier = await this.ctx.storage.get<PasswordVerifier>(PASSWORD)
    const body = await readBody(request)
    const destroyed = (await this.ctx.storage.get<boolean>(DESTROYED)) === true

    const decision = unlockDecision(keys, body.key, verifier !== undefined, destroyed)
    if (!decision.ok) {
      return Response.json({ error: decision.error }, { status: decision.status, headers: CORS })
    }

    /*
     * Rationed only AFTER the link is checked, so somebody without one cannot
     * make a board's real holders wait — they are refused above, as before.
     */
    const now = Date.now()
    const throttle = await this.ctx.storage.get<UnlockThrottle>(UNLOCK_THROTTLE)
    const allowed = unlockAllowed(throttle, now)
    if (!allowed.ok) {
      return Response.json(
        { error: 'Too many attempts', retryAfter: allowed.retryAfterSeconds },
        {
          status: 429,
          headers: {
            ...CORS,
            'retry-after': String(allowed.retryAfterSeconds),
            // Cross-origin, a browser hides every header not named here.
            'access-control-expose-headers': 'retry-after',
          },
        },
      )
    }

    /*
     * Counted as a failure BEFORE the password is checked, and forgiven after.
     * Deriving the hash is not storage I/O, and the runtime only promises to
     * hold other requests back while this object awaits its OWN storage. So
     * counted afterwards, a burst of guesses could all pass the check above
     * before any of them was recorded. Local workerd did not interleave them
     * when tried, which is why no test pins this — the order costs nothing
     * and does not rely on that staying true.
     */
    await this.ctx.storage.put(UNLOCK_THROTTLE, afterFailedUnlock(throttle, now))

    if (verifier === undefined || body.password === null) {
      return Response.json({ error: 'That is not the password' }, { status: 403, headers: CORS })
    }
    if (!(await isPassword(verifier, body.password))) {
      return Response.json({ error: 'That is not the password' }, { status: 403, headers: CORS })
    }
    await this.ctx.storage.delete(UNLOCK_THROTTLE)
    return Response.json({ token: verifier.token }, { headers: CORS })
  }

  async #persist(update: Uint8Array): Promise<void> {
    try {
      await this.#document.persist(update)
    } catch (error) {
      /*
       * Said, rather than lost in a rejection nobody awaits: the people in the
       * room still have the change, so nothing on screen would ever show that
       * the room failed to keep it.
       */
      console.error(`[room] ${this.#knownBoardId ?? 'unnamed'} could not keep a change`, error)
      return
    }
    // After the change is safe: history is a copy, and the copy can wait.
    await this.#history.edited()
  }
}

/**
 * The key out of a destroy request's body.
 *
 * Every failure — no body, not JSON, not an object, no `key`, a `key` that is
 * not a string — answers `null`, which `destroyDecision` refuses exactly as it
 * refuses a wrong key. One answer for every way of not having the right one.
 */
/**
 * The `key` and `password` out of a request body.
 *
 * Same principle as `readKey`: every way of not having a value — no body, not
 * JSON, not an object, wrong type — answers `null`, so there is one answer for
 * every shape of "not that". A `password` of `null` is also what CLEARING one
 * looks like, which is why the two are read the same way.
 */
async function readBody(request: Request): Promise<{
  readonly key: string | null
  readonly password: string | null
}> {
  try {
    const body: unknown = await request.json()
    if (typeof body !== 'object' || body === null) return { key: null, password: null }
    const { key, password } = body as { key?: unknown; password?: unknown }
    return {
      key: typeof key === 'string' ? key : null,
      password: typeof password === 'string' ? password : null,
    }
  } catch {
    return { key: null, password: null }
  }
}

/** Far more than `{"name": …}` with an eighty-character name, escaped, can take. */
const MAX_NAMED_BODY = 4096
const TOO_LONG = 'too-long'

/**
 * Whether a request to keep a version asks for a NAMED one, and the name it
 * gave — still to be checked. No body, or one that is not a JSON object
 * carrying `name`, is a plain "keep the board as it is now". A body longer
 * than `MAX_NAMED_BODY` is `TOO_LONG`, and no more of it is read.
 */
async function readNamed(
  request: Request,
): Promise<
  { readonly named: false } | { readonly named: true; readonly name: unknown } | typeof TOO_LONG
> {
  try {
    const text = await readBounded(request, MAX_NAMED_BODY)
    if (text === null) return TOO_LONG
    if (text.trim() === '') return { named: false }
    const body: unknown = JSON.parse(text)
    if (typeof body !== 'object' || body === null || !('name' in body)) return { named: false }
    return { named: true, name: body.name }
  } catch {
    return { named: false }
  }
}

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
