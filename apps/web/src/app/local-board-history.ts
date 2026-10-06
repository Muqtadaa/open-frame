import { deserializeBoard, type BoardId, type ObjectTypeRegistry } from '@openframe/core'

import type { BoardHistory } from '../runtime/board-history.js'
import type { LocalVersionStore } from '../runtime/local-versions.js'
import type { LocalHistory } from './local-history.js'

/**
 * A local board's history, as the interface asks for it (ADR 0019): the
 * versions this browser keeps, opened as any stored board is opened.
 *
 * A version that only loads with placeholders or repairs is called
 * unreadable rather than half-shown: what it would restore is not what it
 * held, and rule 7 is about exactly that difference.
 */
export function localBoardHistory(deps: {
  readonly boardId: BoardId
  readonly versions: LocalVersionStore
  /** `null` for a board that cannot be written back (rule 7): nothing is kept, so nothing restores. */
  readonly keeper: LocalHistory | null
  readonly registry: ObjectTypeRegistry
}): BoardHistory {
  return {
    list: async () => {
      try {
        const all = await deps.versions.entries()
        const entries = [...(all.get(deps.boardId) ?? [])].sort((a, b) => b.at - a.at)
        // The keys say which versions are named, not what: a name is read from
        // its row. Only named versions are read, and they are few.
        return await Promise.all(
          entries.map(async (entry) => {
            if (entry.kind !== 'named') return entry
            const name = (await deps.versions.read(deps.boardId, entry.id))?.name
            return name === undefined ? entry : { ...entry, name }
          }),
        )
      } catch {
        return null
      }
    },
    open: async (id) => {
      const version = await deps.versions.read(deps.boardId, id).catch(() => null)
      if (version === null) return { status: 'missing' }
      const loaded = deserializeBoard(version.payload, deps.registry)
      if (loaded.status !== 'ok' || loaded.degraded.length > 0 || loaded.repairs.length > 0) {
        return { status: 'unreadable' }
      }
      return {
        status: 'ok',
        title: loaded.document.meta.title,
        objects: [...loaded.document.objects.values()],
      }
    },
    keepNow: () => deps.keeper?.keepNow() ?? Promise.resolve(false),
    name: (name) => deps.keeper?.keepNamed(name) ?? Promise.resolve(false),
    forget: async (id) => {
      // A board that cannot be written back keeps its history as it found it.
      if (deps.keeper === null) return false
      try {
        const all = await deps.versions.entries()
        const entry = all.get(deps.boardId)?.find((version) => version.id === id)
        // Automatic versions are retention's to drop, as in the room.
        if (entry?.kind !== 'named') return false
        await deps.versions.drop(deps.boardId, [entry])
        return true
      } catch {
        return false
      }
    },
  }
}
