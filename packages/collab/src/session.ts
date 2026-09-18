import type {
  AnyOpenFrameObject,
  CommandDispatcher,
  CommandError,
  DispatchResult,
  Patch,
} from '@openframe/core'
import type * as Y from 'yjs'

import { applyPatchesToDoc, LOCAL_ORIGIN, objectsOf } from './document-map.js'
import { parentageCandidates, patchesFromEvent } from './remote-patches.js'

export interface CollabSessionDeps {
  readonly doc: Y.Doc
  readonly dispatcher: CommandDispatcher
  /**
   * Called when a merged change could not be applied locally.
   *
   * Required, with no default, because neither default is defensible: a no-op
   * makes a dropped change look identical to lost work, and throwing takes the
   * sync loop down over one bad batch. The caller is the only one who knows
   * whether that is a toast, a log line or a reconnect.
   */
  readonly onError: (error: CommandError) => void
}

type Ok = Extract<DispatchResult, { ok: true }>

/**
 * Binds a `Y.Doc` to the `CommandDispatcher`, in both directions.
 *
 * There is deliberately no transport here. A session is a pure function of two
 * event streams, which is what lets the whole of it be tested with two `Y.Doc`s
 * in one process — if a test of this file needs a socket, the seam is in the
 * wrong place ([ADR 0013](../../../docs/adr/0013-collaboration-transport-durable-objects.md)).
 *
 * What it does NOT do is decide which side has the truth when a client with
 * local work meets a room that already has a board. That depends on the
 * handshake, the handshake belongs to the transport, and the transport is
 * Stage 2. `seedDoc` is there for a caller that already knows the answer.
 */
export class CollabSession {
  readonly #doc: Y.Doc
  readonly #dispatcher: CommandDispatcher
  readonly #onError: (error: CommandError) => void
  readonly #detach: (() => void)[] = []

  /**
   * True while a merged change is being dispatched.
   *
   * This is the guard on the OUTBOUND direction, and it is the honest one: a
   * change the dispatcher is emitting right now, because this session put it
   * there, must not be written straight back into the `Y.Doc` it came from.
   * Testing `origin === 'remote'` instead would work today and would quietly
   * stop working the moment anything else in the system dispatches with that
   * origin — an import, a replay, an agent.
   */
  #merging = false

  private constructor(deps: CollabSessionDeps) {
    this.#doc = deps.doc
    this.#dispatcher = deps.dispatcher
    this.#onError = deps.onError
  }

  static join(deps: CollabSessionDeps): CollabSession {
    const session = new CollabSession(deps)
    session.#start()
    return session
  }

  #start(): void {
    const objects = objectsOf(this.#doc)
    const observer = (event: Y.YMapEvent<AnyOpenFrameObject>, transaction: Y.Transaction): void => {
      this.#merge(event, transaction)
    }
    objects.observe(observer)
    this.#detach.push(() => {
      objects.unobserve(observer)
    })
    this.#detach.push(
      this.#dispatcher.subscribe((result) => {
        this.#publish(result)
      }),
    )
  }

  /** Detaches both directions. The `Y.Doc` and the document are left as they are. */
  stop(): void {
    for (const detach of this.#detach.splice(0)) detach()
  }

  /** Local change → `Y.Doc`. */
  #publish(result: Ok): void {
    if (this.#merging) return
    applyPatchesToDoc(this.#doc, result.patches, LOCAL_ORIGIN)
  }

  /** `Y.Doc` → local change. */
  #merge(event: Y.YMapEvent<AnyOpenFrameObject>, transaction: Y.Transaction): void {
    if (transaction.origin === LOCAL_ORIGIN) return

    const patches = patchesFromEvent(event)
    if (patches.length === 0) return

    let merged: DispatchResult
    this.#merging = true
    try {
      merged = this.#dispatcher.dispatch(
        { kind: 'ApplyRemotePatches', patches },
        // `skipUndo` because undo must revert YOUR change, not the most recent
        // one. Both of these have been on the envelope since Phase 1, waiting.
        { origin: 'remote', skipUndo: true },
      )
    } finally {
      this.#merging = false
    }

    if (!merged.ok) {
      this.#onError(merged.error)
      return
    }
    this.#repair(merged.patches)
  }

  /**
   * Restores parentage after a merge, and lets the repair go out like any other
   * local change.
   *
   * Note where this sits: OUTSIDE `#merging`, on purpose. The repair is not a
   * remote change being echoed, it is this client's own write about the merged
   * document — so it must reach the `Y.Doc`, or every peer would keep repairing
   * a corruption that stays in the shared state forever and greets the next
   * person to open the board.
   *
   * Every peer makes the same write, because `parentageRepairs` is
   * deterministic. That is N writes of one value where one would do, and it is
   * the right trade in Stage 1: agreeing without a leader is worth more than
   * the traffic, and there is no leader to elect until there is a room.
   *
   * This runs inside the `Y.Map` observer, which is safe and verified rather
   * than assumed: a `transact` called from an observer opens its OWN
   * transaction with its own origin — it does not silently join the one being
   * cleaned up — so the write-back is tagged `LOCAL_ORIGIN` and skipped on the
   * way back in, as intended.
   */
  #repair(merged: readonly Patch[]): void {
    const ids = parentageCandidates(merged)
    if (ids.length === 0) return

    const repaired = this.#dispatcher.dispatch(
      { kind: 'RepairParentage', ids },
      { origin: 'remote', skipUndo: true },
    )
    if (!repaired.ok) this.#onError(repaired.error)
  }
}
