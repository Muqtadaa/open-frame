import { createContext, useContext } from 'react'

import type { BoardConnection } from '@openframe/collab'

import type {
  BoardId,
  BoardRepository,
  CommandDispatcher,
  DocumentStore,
  IdGenerator,
  ObjectTypeRegistry,
} from '@openframe/core'

import type { AssetService } from './asset-service.js'
import type { ObjectViewRegistry } from '../views/registry.js'

/**
 * Development-only affordances, absent from production builds.
 *
 * NOT a mutation path: `loadBoard` performs exactly the same
 * deserialize-and-replace that opening a board does, through the same validated
 * load pipeline. It exists because benchmark fixtures are otherwise unreachable
 * from the running app — the `DocumentWriter` is deliberately not exposed.
 */
export interface OpenFrameDevTools {
  loadBoard(raw: unknown): { ok: true; objects: number } | { ok: false; reason: string }
  clearBoard(): void
}

/**
 * The wired application, as every layer below the composition root sees it.
 *
 * These types live here rather than beside `createRuntime` so that consuming a
 * runtime does not mean depending on the module that builds one — which would
 * put every layer above the composition root and make the dependency direction
 * meaningless.
 */
export interface OpenFrameRuntime {
  readonly boardId: BoardId
  readonly store: DocumentStore
  readonly registry: ObjectTypeRegistry
  readonly dispatcher: CommandDispatcher
  /**
   * Ids, for the one case a caller needs one BEFORE dispatching: a composite
   * whose later command refers to an object its earlier command creates.
   * Handing these out is harmless — an id on its own changes nothing, and every
   * mutation still goes through the dispatcher.
   */
  readonly ids: IdGenerator
  readonly repository: BoardRepository
  /** Uploads, and the renderer's synchronous view of resolved asset URLs. */
  readonly assets: AssetService
  /** Non-fatal problems found while loading, surfaced to the user. */
  readonly notices: readonly string[]
  /** True when the board could not be read and must not be written back. */
  readonly readOnly: boolean
  /** Present only in development and benchmark builds. */
  readonly devTools?: OpenFrameDevTools
  /**
   * Writes anything autosave is still holding, and resolves when it is done.
   *
   * Autosave coalesces a burst of commands into one write, so the document on
   * screen is routinely ahead of the document on disk — by 500ms in the
   * shipped build. Anything that takes the user off this board awaits this
   * first. A read-only board resolves immediately having written nothing,
   * because a document we could not fully read is never written back.
   */
  flush(): Promise<void>
  dispose(): void
}

export interface OpenFrameContextValue {
  readonly runtime: OpenFrameRuntime
  /**
   * The room this board is in, or `null` for a board that is nobody else's.
   *
   * A type from `@openframe/collab`, which is a package rather than an adapter,
   * so the layer rules are satisfied — and it is an interface with no Yjs in
   * it, so the quarantine holds too.
   */
  readonly collaboration?: BoardConnection | null
  readonly views: ObjectViewRegistry
}

export const OpenFrameContext = createContext<OpenFrameContextValue | null>(null)

/**
 * Access to the wired application.
 *
 * Note what this hands out: the READ-ONLY document store and the dispatcher.
 * There is no way to reach the document writer from a component, because the
 * composition root never puts it in here.
 */
export function useOpenFrame(): OpenFrameContextValue {
  const value = useContext(OpenFrameContext)
  if (value === null) {
    throw new Error('useOpenFrame must be used inside <OpenFrameProvider>')
  }
  return value
}
