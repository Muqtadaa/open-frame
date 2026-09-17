import {
  createDefaultRegistry,
  deserializeBoard,
  serializeBoard,
  type BoardDocument,
  type BoardId,
  type BoardRepository,
  type BoardSummary,
  type LoadResult,
  type ObjectTypeRegistry,
  type Patch,
  applyPatches,
} from '@openframe/core'

/**
 * An in-memory repository, for tests and for the E2E suite's clean-slate runs.
 *
 * It serializes and deserializes exactly as the real adapter does rather than
 * holding live documents, so tests exercise the actual persistence round trip
 * instead of a shortcut that would hide serialization bugs.
 */
export class MemoryBoardRepository implements BoardRepository {
  readonly #boards = new Map<BoardId, unknown>()
  readonly #registry: ObjectTypeRegistry

  constructor(registry: ObjectTypeRegistry = createDefaultRegistry()) {
    this.#registry = registry
  }

  getBoard(id: BoardId): Promise<LoadResult | { status: 'not-found' }> {
    const raw = this.#boards.get(id)
    if (raw === undefined) return Promise.resolve({ status: 'not-found' as const })
    return Promise.resolve(deserializeBoard(raw, this.#registry))
  }

  saveBoard(document: BoardDocument): Promise<void> {
    this.#boards.set(document.id, serializeBoard(document, Date.now()))
    return Promise.resolve()
  }

  async applyPatches(id: BoardId, patches: readonly Patch[]): Promise<void> {
    const loaded = await this.getBoard(id)
    if (loaded.status !== 'ok') return
    await this.saveBoard(applyPatches(loaded.document, patches))
  }

  listBoards(): Promise<readonly BoardSummary[]> {
    const summaries: BoardSummary[] = []
    for (const [id, raw] of this.#boards) {
      const envelope = raw as { savedAt?: number; board?: { meta?: { title?: string } } }
      summaries.push({
        id,
        title: envelope.board?.meta?.title ?? 'Untitled board',
        updatedAt: envelope.savedAt ?? 0,
      })
    }
    return Promise.resolve(summaries)
  }

  deleteBoard(id: BoardId): Promise<void> {
    this.#boards.delete(id)
    return Promise.resolve()
  }

  /** Test seam: plant a raw payload, including a deliberately corrupt one. */
  seedRaw(id: BoardId, raw: unknown): void {
    this.#boards.set(id, raw)
  }
}
