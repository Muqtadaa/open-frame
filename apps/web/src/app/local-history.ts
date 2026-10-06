import { serializeBoard, type BoardDocument, type BoardId } from '@openframe/core'
import {
  LOCAL_RETENTION,
  VERSION_TIMING,
  versionDueAt,
  versionId,
  versionsToDrop,
  type VersionTiming,
} from '@openframe/core/history'

import type { LocalVersionStore } from '../runtime/local-versions.js'

/**
 * A local board's history, kept in this browser (ADR 0019).
 *
 * The same rules as a shared board's room — `@openframe/core/history` decides
 * when a version is due and which are kept — with the browser's retention:
 * fourteen days, then named versions only. Attached to the command stream the
 * way autosave is, and never to a board that cannot be written back (rule 7)
 * or to a shared one, whose room keeps its history.
 *
 * A version is the board as `serializeBoard` writes it, so opening one later
 * is `deserializeBoard`, with quarantine and all.
 */
export interface LocalHistoryDeps {
  readonly boardId: BoardId
  /** The command stream: every committed change, never a drag in progress (rule 4). */
  readonly subscribe: (listener: () => void) => () => void
  readonly document: () => BoardDocument
  readonly versions: LocalVersionStore
  readonly now?: () => number
  /** Sets a timer; answers how to cancel it. Injected so tests choose the time. */
  readonly schedule?: (ms: number, run: () => void) => () => void
  readonly timing?: VersionTiming
  readonly random?: () => number
}

export interface LocalHistory {
  /** Resolves once whatever the keeper has started has finished. For tests. */
  readonly idle: () => Promise<void>
  readonly dispose: () => void
}

export function keepLocalHistory(deps: LocalHistoryDeps): LocalHistory {
  const now = deps.now ?? Date.now
  const timing = deps.timing ?? VERSION_TIMING
  const schedule =
    deps.schedule ??
    ((ms: number, run: () => void) => {
      const timer = setTimeout(run, ms)
      return () => clearTimeout(timer)
    })

  let dirtySince: number | null = null
  let lastEditAt: number | null = null
  let lastVersionAt: number | null = null
  /** Counts edits, so a version taken while one arrives knows it missed it. */
  let edits = 0
  let cancel: (() => void) | null = null
  let disposed = false
  /** Everything started, in order: a version is never written before the thinning ahead of it. */
  let work: Promise<void> = Promise.resolve()

  const run = (step: () => Promise<void>): void => {
    work = work.then(step).catch((error: unknown) => {
      // History is a copy. A version that could not be kept is not lost work,
      // so it is logged and the board carries on; the next edit tries again.
      console.error('[openframe] could not keep a version of this board', error)
    })
  }

  const dueAt = (): number | null => versionDueAt({ dirtySince, lastEditAt, lastVersionAt }, timing)

  const arm = (): void => {
    if (disposed || cancel !== null) return
    const due = dueAt()
    if (due === null) return
    cancel = schedule(Math.max(0, due - now()), () => {
      cancel = null
      const stillDue = dueAt()
      if (stillDue === null) return
      // Somebody kept editing: the alarm only decides when it fires (as the
      // room's does), so one timer serves a whole burst of edits.
      if (stillDue > now()) {
        arm()
        return
      }
      run(take)
    })
  }

  const take = async (): Promise<void> => {
    if (disposed) return
    /*
     * Asked again now that the work has reached the front of the queue. A
     * timer armed by an edit while the PREVIOUS version was being written saw
     * that version's stale state and queued this one; taken unconditionally,
     * it would land straight after it rather than an interval later (Codex,
     * on #82).
     */
    const due = dueAt()
    if (due === null) return
    if (due > now()) {
      arm()
      return
    }
    const at = now()
    // Read together and synchronously: an edit after this is one the version missed.
    const seen = edits
    const document = deps.document()
    await deps.versions.put({
      boardId: deps.boardId,
      id: versionId(at, deps.random),
      at,
      kind: 'auto',
      title: document.meta.title,
      payload: serializeBoard(document, at),
    })
    lastVersionAt = at
    dirtySince = edits === seen ? null : (lastEditAt ?? at)
    await thin()
    arm()
  }

  /**
   * Drops what retention no longer keeps — for EVERY board in this browser,
   * not just this one. A board that was deleted elsewhere, or shared and so
   * moved to a new id, is never opened again to thin its own; this is what
   * lets its versions age out at all.
   */
  const thin = async (): Promise<void> => {
    const at = now()
    const all = await deps.versions.entries()
    for (const [boardId, entries] of all) {
      const ids = new Set(versionsToDrop(entries, at, LOCAL_RETENTION))
      if (ids.size === 0) continue
      await deps.versions.drop(
        boardId,
        entries.filter((entry) => ids.has(entry.id)),
      )
    }
  }

  // Before anything else: when this board last had a version, so the first
  // edit of a session does not take one sooner than the interval allows.
  run(async () => {
    const all = await deps.versions.entries()
    for (const entry of all.get(deps.boardId) ?? []) {
      if (lastVersionAt === null || entry.at > lastVersionAt) lastVersionAt = entry.at
    }
    await thin()
  })

  const unsubscribe = deps.subscribe(() => {
    lastEditAt = now()
    dirtySince ??= lastEditAt
    edits++
    arm()
  })

  return {
    idle: async () => {
      // Work queued while waiting is waited for too.
      let seen: Promise<void>
      do {
        seen = work
        await seen
      } while (seen !== work)
    },
    dispose: () => {
      disposed = true
      cancel?.()
      cancel = null
      unsubscribe()
    },
  }
}
