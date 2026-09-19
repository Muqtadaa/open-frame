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
  type Capabilities,
  type AssetStore,
  type DocumentStore,
} from '@openframe/core'

import { IndexedDbAssetStore } from '../adapters/indexeddb/indexeddb-asset-store.js'
import { IndexedDbBoardRepository } from '../adapters/indexeddb/indexeddb-board-repository.js'
import { AssetService } from '../runtime/asset-service.js'
import { BENCH_TOOLS_ENABLED } from './bench-flag.js'
import type { OpenFrameRuntime } from '../runtime/context.js'

export type { OpenFrameRuntime } from '../runtime/context.js'

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

export interface CreateRuntimeOptions {
  readonly boardId?: BoardId
  /**
   * What this client may do. Omitted for a local board, where the only actor
   * is the person at the keyboard; supplied for a shared one, where the room
   * decides and may narrow it once the socket answers.
   */
  readonly capabilities?: Capabilities
  readonly repository?: BoardRepository
  readonly assetStore?: AssetStore
  readonly autosaveDelayMs?: number
}

export const DEFAULT_BOARD_ID = asBoardId('board_local')
const DEFAULT_AUTOSAVE_DELAY_MS = 500

export async function createRuntime(options: CreateRuntimeOptions = {}): Promise<OpenFrameRuntime> {
  const boardId = options.boardId ?? DEFAULT_BOARD_ID
  const repository = options.repository ?? new IndexedDbBoardRepository()
  const registry = createDefaultRegistry()
  const ids = createIdGenerator()
  const assets = new AssetService(options.assetStore ?? new IndexedDbAssetStore(), ids)

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
    ids,
    /*
     * A local board has one actor and grants everything. A shared board is
     * handed capabilities the room can narrow — and either way this check is a
     * UX affordance, never a control: the room re-authorizes every write.
     */
    capabilities: options.capabilities ?? allowAllCapabilities,
  })

  const autosave = readOnly
    ? // A quarantined board is never written back, so there is nothing to
      // detach and nothing to flush. Both are no-ops rather than absent, so
      // that no caller has to ask which kind of board it is holding.
      { flush: () => Promise.resolve(), dispose: () => undefined }
    : subscribeAutosave(
        dispatcher,
        store,
        repository,
        options.autosaveDelayMs ?? DEFAULT_AUTOSAVE_DELAY_MS,
      )

  /*
   * The same window, reached the other way.
   *
   * A deliberate exit awaits `flush`; a reload, a closed tab or a swipe back
   * cannot be awaited by anybody, so this is best effort and says so. `pagehide`
   * rather than `beforeunload` because the latter disqualifies the page from
   * the back-forward cache, and this must not make going back slower in order
   * to make it safer.
   */
  const onPageHide = (): void => void autosave.flush()
  const hasWindow = typeof window !== 'undefined'
  if (hasWindow) window.addEventListener('pagehide', onPageHide)

  // Detached with the runtime. A listener outliving the board it saves would
  // write a disposed document over a live one the next time the page went away.
  const dispose = (): void => {
    if (hasWindow) window.removeEventListener('pagehide', onPageHide)
    autosave.dispose()
  }

  const runtime: OpenFrameRuntime = {
    boardId,
    store,
    registry,
    dispatcher,
    ids,
    repository,
    assets,
    notices,
    readOnly,
    flush: autosave.flush,
    dispose,
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
): { readonly flush: () => Promise<void>; readonly dispose: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  /*
   * The write in flight, so a flush can WAIT for one rather than start a
   * second. Without it, leaving the board during a slow save resolves before
   * the save it is supposed to be waiting for.
   */
  let inFlight: Promise<void> = Promise.resolve()

  const save = (): Promise<void> => {
    inFlight = repository.saveBoard(store.getDocument()).catch((error: unknown) => {
      console.error('[openframe] failed to save board', error)
    })
    return inFlight
  }

  const unsubscribe = dispatcher.subscribe(() => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void save()
    }, delayMs)
  })

  const flush = async (): Promise<void> => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
      await save()
      return
    }
    // Nothing pending, but a save may still be on its way to the disk.
    await inFlight
  }

  return {
    flush,
    dispose: () => {
      if (timer !== undefined) clearTimeout(timer)
      unsubscribe()
    },
  }
}

/** Exposed for the E2E suite and for debugging in the console. */
export function snapshotForDebug(runtime: OpenFrameRuntime): string {
  return JSON.stringify(serializeBoard(runtime.store.getDocument(), Date.now()))
}
