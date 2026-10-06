import type { VersionKind } from '@openframe/core/history'

/**
 * A board's earlier versions, as the interface sees them (ADR 0019): the
 * room's for a shared board, this browser's for a local one. Chosen once by
 * the composition root, so no component asks which kind of board it is on.
 */
export interface VersionListing {
  readonly id: string
  readonly at: number
  readonly kind: VersionKind
  readonly name?: string
}

/**
 * One version, opened. `objects` are exactly as stored — UNREAD; whatever
 * shows or restores them reads them with `readVersionObjects`.
 */
export type OpenedVersion =
  | { readonly status: 'ok'; readonly title: string | null; readonly objects: readonly unknown[] }
  /** Gone (thinned since the list was read), or never this board's. */
  | { readonly status: 'missing' }
  /** Stored in a form this build cannot read. */
  | { readonly status: 'unreadable' }
  | { readonly status: 'unreachable' }

export interface BoardHistory {
  /** Newest first, or `null` when the versions could not be reached. */
  readonly list: () => Promise<readonly VersionListing[] | null>
  readonly open: (id: string) => Promise<OpenedVersion>
  /**
   * Keeps the board as it is now, if anything has changed since its newest
   * version. Asked before a restore, so what is replaced is kept too; a
   * restore must not go ahead when this answers `false`.
   */
  readonly keepNow: () => Promise<boolean>
}
