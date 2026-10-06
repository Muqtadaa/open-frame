import type { BoardId } from '@openframe/core'
import type { VersionEntry, VersionKind } from '@openframe/core/history'

/**
 * A local board's earlier versions, as the interface sees them (ADR 0019).
 *
 * A port, so the keeper that takes versions and the panel that will list them
 * are written against what history IS rather than against IndexedDB.
 */
export interface LocalVersion {
  readonly boardId: BoardId
  /** Time-sortable, the same shape as a room's (`versionId`). */
  readonly id: string
  readonly at: number
  readonly kind: VersionKind
  readonly name?: string
  /** The board's title when the version was taken. */
  readonly title: string
  /** The board as `serializeBoard` wrote it, so opening one is `deserializeBoard`. */
  readonly payload: unknown
}

export interface LocalVersionStore {
  /**
   * Every version this browser holds, by board, from the keys alone: what
   * thinning needs, without reading any board back.
   */
  readonly entries: () => Promise<ReadonlyMap<BoardId, readonly VersionEntry[]>>
  readonly read: (boardId: BoardId, id: string) => Promise<LocalVersion | null>
  readonly put: (version: LocalVersion) => Promise<void>
  readonly drop: (boardId: BoardId, versions: readonly VersionEntry[]) => Promise<void>
  /** Every version of a board, when the board itself is deleted. */
  readonly forget: (boardId: BoardId) => Promise<void>
}
