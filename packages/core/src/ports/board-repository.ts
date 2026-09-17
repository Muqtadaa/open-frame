import type { BoardDocument } from '../domain/document.js'
import type { BoardId } from '../domain/ids.js'
import type { Patch } from '../domain/patch.js'
import type { LoadResult } from '../schema/deserialize.js'

export interface BoardSummary {
  readonly id: BoardId
  readonly title: string
  readonly updatedAt: number
}

/**
 * Where boards live.
 *
 * Phase 1 implements this over IndexedDB; a server implementation over
 * Postgres arrives later. The domain never learns which.
 *
 * `applyPatches` is here FROM DAY ONE even though the IndexedDB adapter
 * satisfies it by read-modify-write. Designing the port around whole-document
 * saves would bake that assumption into every call site, and the day a real
 * database arrives — where writing the entire board on every drag is not an
 * option — the change would no longer be a new class but a rewrite.
 *
 * Note there is no `updatedAt` on the document itself: "last modified" is
 * derived HERE, at the persistence layer, precisely so it is not a contended
 * field inside the shared document.
 */
export interface BoardRepository {
  getBoard(id: BoardId): Promise<LoadResult | { readonly status: 'not-found' }>
  saveBoard(document: BoardDocument): Promise<void>
  applyPatches(id: BoardId, patches: readonly Patch[]): Promise<void>
  listBoards(): Promise<readonly BoardSummary[]>
  deleteBoard(id: BoardId): Promise<void>
}
