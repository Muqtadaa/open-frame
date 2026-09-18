import { createContext, useContext } from 'react'

import type {
  BoardId,
  BoardRepository,
  CommandDispatcher,
  DocumentStore,
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
  readonly repository: BoardRepository
  /** Uploads, and the renderer's synchronous view of resolved asset URLs. */
  readonly assets: AssetService
  /** Non-fatal problems found while loading, surfaced to the user. */
  readonly notices: readonly string[]
  /** True when the board could not be read and must not be written back. */
  readonly readOnly: boolean
  /** Present only in development and benchmark builds. */
  readonly devTools?: OpenFrameDevTools
  dispose(): void
}

export interface OpenFrameContextValue {
  readonly runtime: OpenFrameRuntime
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
