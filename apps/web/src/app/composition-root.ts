import {
  CommandDispatcher,
  deserializeBoard,
  allowAllCapabilities,
  asBoardId,
  createDefaultRegistry,
  createDocumentStore,
  createEmptyDocument,
  createIdGenerator,
  serializeBoard,
  systemClock,
  type BoardId,
  type BoardRepository,
  type DocumentStore,
  type ObjectTypeRegistry,
} from '@openframe/core'

import { IndexedDbBoardRepository } from '../adapters/indexeddb/indexeddb-board-repository.js'
import { BENCH_TOOLS_ENABLED } from './bench-flag.js'

/**
 * THE composition root.
 *
 * This is the only module in the application that knows both an interface and
 * which implementation satisfies it. Everything downstream receives what it
 * needs and cannot discover where the data really goes — which is exactly what
 * makes IndexedDB replaceable by a server, and the permissive Phase 1
 * capability check replaceable by a real one.
 *
 * It is also the only place that holds the document WRITER. The rest of the
 * app receives the read-only `DocumentStore`, so "the UI does not mutate the
 * document directly" is enforced by what the types make reachable.
 */

/**
 * Development-only affordances, absent from production builds.
 *
 * This is NOT a mutation path: `loadBoard` performs exactly the same
 * deserialize-and-replace that opening a board does, through the same validated
 * load pipeline. It exists because benchmark fixtures are otherwise unreachable
 * from the running app — the `DocumentWriter` is deliberately not exposed, so
 * there was no way to put 10,000 objects on screen and look at them.
 */
export interface OpenFrameDevTools {
  loadBoard(raw: unknown): { ok: true; objects: number } | { ok: false; reason: string }
  clearBoard(): void
}

export interface OpenFrameRuntime {
  readonly boardId: BoardId
  readonly store: DocumentStore
  readonly registry: ObjectTypeRegistry
  readonly dispatcher: CommandDispatcher
  readonly repository: BoardRepository
  /** Non-fatal problems found while loading, surfaced to the user. */
  readonly notices: readonly string[]
  /** True when the board could not be read and must not be written back. */
  readonly readOnly: boolean
  /** Present only in development builds. */
  readonly devTools?: OpenFrameDevTools
  dispose(): void
}

export interface CreateRuntimeOptions {
  readonly boardId?: BoardId
  readonly repository?: BoardRepository
  readonly autosaveDelayMs?: number
}

export const DEFAULT_BOARD_ID = asBoardId('board_local')
const DEFAULT_AUTOSAVE_DELAY_MS = 500

export async function createRuntime(options: CreateRuntimeOptions = {}): Promise<OpenFrameRuntime> {
  const boardId = options.boardId ?? DEFAULT_BOARD_ID
  const repository = options.repository ?? new IndexedDbBoardRepository()
  const registry = createDefaultRegistry()

  const notices: string[] = []
  let readOnly = false

  const loaded = await repository.getBoard(boardId)
  let document = createEmptyDocument(boardId, 'Untitled board', systemClock.now())

  if (loaded.status === 'ok') {
    document = loaded.document
    if (loaded.degraded.length > 0) {
      notices.push(
        `${loaded.degraded.length} object(s) could not be read by this version and are shown as placeholders.`,
      )
    }
    if (loaded.repairs.length > 0) {
      notices.push(
        `Repaired ${loaded.repairs.length} structural problem(s) while opening the board.`,
      )
    }
  } else if (loaded.status === 'quarantined') {
    // CARDINAL RULE: never write back a document we could not fully read.
    // A partial save over an unreadable board destroys the user's work.
    readOnly = true
    notices.push(
      `This board could not be opened (${loaded.reason}). It is read-only to protect your data.`,
    )
  }

  const { store, writer } = createDocumentStore(document)

  const dispatcher = new CommandDispatcher({
    store,
    writer,
    registry,
    clock: systemClock,
    ids: createIdGenerator(),
    // Phase 1 is single-player and local. When a server exists, every command
    // is re-authorized there; this check is a UX affordance, never a control.
    capabilities: allowAllCapabilities,
  })

  const unsubscribe = readOnly
    ? // A quarantined board is never written back, so there is nothing to detach.
      () => undefined
    : subscribeAutosave(
        dispatcher,
        store,
        repository,
        options.autosaveDelayMs ?? DEFAULT_AUTOSAVE_DELAY_MS,
      )

  const runtime: OpenFrameRuntime = {
    boardId,
    store,
    registry,
    dispatcher,
    repository,
    notices,
    readOnly,
    dispose: unsubscribe,
  }

  if (!BENCH_TOOLS_ENABLED) return runtime

  return {
    ...runtime,
    devTools: {
      loadBoard(raw) {
        const result = deserializeBoard(raw, registry)
        if (result.status !== 'ok') {
          return {
            ok: false,
            reason: result.status === 'quarantined' ? result.reason : 'not-found',
          }
        }
        /*
         * `replaceDocument` does not go through the dispatcher, so autosave —
         * which subscribes to the command stream — does not fire. A loaded
         * fixture stays in memory until the next real command, and does not
         * silently overwrite whatever board is on disk.
         */
        writer.replaceDocument({ ...result.document, id: boardId })
        return { ok: true, objects: result.document.objects.size }
      },
      clearBoard() {
        writer.replaceDocument(createEmptyDocument(boardId, 'Untitled board', systemClock.now()))
      },
    },
  }
}

/**
 * Persistence, attached to the command stream rather than to React.
 *
 * Saves are coalesced: a burst of commands produces one write. The repository
 * port is already patch-aware, so a future server adapter can stream patches
 * here instead of rewriting the whole board — without this call site changing.
 */
function subscribeAutosave(
  dispatcher: CommandDispatcher,
  store: DocumentStore,
  repository: BoardRepository,
  delayMs: number,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined

  const unsubscribe = dispatcher.subscribe(() => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void repository.saveBoard(store.getDocument()).catch((error: unknown) => {
        console.error('[openframe] failed to save board', error)
      })
    }, delayMs)
  })

  return () => {
    if (timer !== undefined) clearTimeout(timer)
    unsubscribe()
  }
}

/** Exposed for the E2E suite and for debugging in the console. */
export function snapshotForDebug(runtime: OpenFrameRuntime): string {
  return JSON.stringify(serializeBoard(runtime.store.getDocument(), Date.now()))
}
