import type { LoggedChange } from '@openframe/collab'
import type { TransactionId } from '@openframe/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { guestIdentity } from '../app/guest.js'

import { useCommands } from '../hooks/use-commands.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { fitToObjects } from '../scene/zoom.js'
import { Ago } from './Ago.js'
import { readSeen, writeSeen } from './agent-seen.js'

export interface AgentChangesState {
  /** Everything in the board's change log, newest first; empty off a room. */
  readonly changes: readonly LoggedChange[]
  /** How many are still on the board, not taken back. */
  readonly pending: number
  /** Of those, how many this browser has not been shown: what the inbox counts. */
  readonly unseen: number
  /** Whether this browser has been shown a change. */
  readonly isSeen: (change: LoggedChange) => boolean
  /** Everything listed now has been looked at. */
  readonly markSeen: () => void
  /** Whether this person may take a change back: not a viewer. */
  readonly editing: boolean
  readonly revert: (change: LoggedChange) => void
  /** Selects what the change touched that is still on the board, and frames it. */
  readonly show: (change: LoggedChange) => void
  /**
   * How many of a change's objects were left because somebody had changed
   * them since, for the reverts made here. Said on the row as well as aloud:
   * an announcement is gone the moment it is made.
   */
  readonly kept: ReadonlyMap<string, number>
}

/**
 * What agents have done to this board, and a way to take any of it back
 * (tracks A-2). Listed in the board's inbox (`Inbox`).
 *
 * An agent's change reached the board with nothing attached — no name, no
 * boundary, no undo — so a person could only watch it happen. The board's
 * change log carries all three now. This lists it, and says so the moment a
 * new change lands: a toast with Revert on it, because that is when somebody
 * is looking, and the inbox for after the toast has gone.
 */
export function useAgentChanges(): AgentChangesState {
  const { runtime, collaboration } = useOpenFrame()
  const commands = useCommands()
  const [changes, setChanges] = useState<readonly LoggedChange[]>([])
  const [role, setRole] = useState(collaboration?.role ?? 'editor')
  const [seenIds, setSeenIds] = useState(() => readSeen(runtime.boardId))
  /*
   * The changes already on the board when it opened. Those are history, not
   * news: toasting each of them on every reload would be a board that shouts
   * about the past every time it is opened.
   */
  const seen = useRef<Set<string> | null>(null)
  /*
   * This browser's own reverts, by the transaction each one was, so an undo
   * of one can be recognised. Undo puts the agent's change back on the board,
   * and a log that went on saying "taken back" would hide Revert and have the
   * agent refuse it as already reverted (Codex, on #16). Lives as long as the
   * undo history it answers to.
   */
  const reverts = useRef(new Map<TransactionId, string>())

  const [kept, setKept] = useState<ReadonlyMap<string, number>>(() => new Map())
  const revert = useCallback(
    (change: LoggedChange): void => {
      const done = commands.revertChange(change)
      if (done === null) return
      reverts.current.set(done.transactionId, change.id)
      setKept((was) => new Map(was).set(change.id, done.kept))
    },
    [commands],
  )

  const show = useCallback(
    (change: LoggedChange): void => {
      const doc = runtime.store.getDocument()
      const ids = change.affected.filter((id) => doc.objects.has(id))
      const store = useInteractionStore.getState()
      store.setSelection(ids)
      const framed = fitToObjects(
        doc,
        runtime.registry,
        ids,
        store.canvasSize.width,
        store.canvasSize.height,
      )
      if (framed !== null) store.setViewport(framed)
    },
    [runtime],
  )

  useEffect(() => {
    if (collaboration === null || collaboration === undefined) return
    return runtime.dispatcher.subscribe((result) => {
      if (result.replayed === undefined) return
      const change = reverts.current.get(result.replayed.transactionId)
      if (change === undefined) return
      if (result.replayed.direction === 'undo') collaboration.clearReverted(change)
      else collaboration.markReverted(change, guestIdentity().name)
    })
  }, [runtime, collaboration])

  useEffect(() => {
    if (collaboration === null || collaboration === undefined) return
    return collaboration.onRole(setRole)
  }, [collaboration])

  useEffect(() => {
    if (collaboration === null || collaboration === undefined) return
    return collaboration.onChanges((next) => {
      setChanges(next)
      /*
       * Everything here before the room has sent the board is history, not
       * news. A browser that has never held this board starts with an empty
       * log and receives the whole of it in the sync, and that used to toast
       * the newest old change on arrival (Codex, on #16).
       */
      if (seen.current === null || !collaboration.synced) {
        seen.current = new Set(next.map((change) => change.id))
        return
      }
      const known = seen.current
      const arrived = next.filter((change) => !known.has(change.id))
      for (const change of arrived) known.add(change.id)
      const newest = arrived.find((change) => change.reverted === null)
      if (newest === undefined) return
      useInteractionStore.getState().showToast(
        `${whose(newest)}: ${newest.label}`,
        collaboration.role === 'viewer'
          ? undefined
          : {
              label: 'Revert',
              run: () => {
                revert(newest)
              },
            },
      )
    })
  }, [collaboration, revert])

  const present = useMemo(
    () => (collaboration === null || collaboration === undefined ? [] : changes),
    [collaboration, changes],
  )
  const markSeen = useCallback((): void => {
    setSeenIds((was) => {
      if (present.every((change) => was.has(change.id))) return was
      const next = new Set([...was, ...present.map((change) => change.id)])
      writeSeen(runtime.boardId, next)
      return next
    })
  }, [present, runtime.boardId])
  const waiting = present.filter((change) => change.reverted === null)
  return {
    changes: present,
    pending: waiting.length,
    unseen: waiting.filter((change) => !seenIds.has(change.id)).length,
    isSeen: (change) => seenIds.has(change.id),
    markSeen,
    editing: role !== 'viewer',
    revert,
    show,
    kept,
  }
}

/** The changes themselves, with Revert on each one still on the board. */
export function AgentChangeItems({
  state,
  onShown,
}: {
  readonly state: AgentChangesState
  /** After Show: the sheet gets out of the way of what it showed. */
  readonly onShown?: () => void
}) {
  return (
    <ul className="of-mentions__list" data-testid="agent-changes-list">
      {state.changes.map((change) => (
        <li
          key={change.id}
          className={
            state.isSeen(change) || change.reverted !== null
              ? 'of-agent-changes__item'
              : 'of-agent-changes__item of-agent-changes__item--new'
          }
          data-testid={`agent-change-${change.id}`}
          data-unread={state.isSeen(change) || change.reverted !== null ? 'false' : 'true'}
          data-reverted={change.reverted === null ? 'false' : 'true'}
          tabIndex={-1}
        >
          <span className="of-mentions__who">{change.label}</span>
          <span className="of-mentions__where">
            {whose(change)} · <Ago at={change.at} />
            {/*
             * Only when the label does not already count: "Create 3 objects ·
             * 3 objects" said it twice. "Make a frame" names no number, and how
             * much it touched is worth knowing.
             */}
            {/\d/.test(change.label) ? null : (
              <span className="of-agent-changes__count"> · {objects(change.affected.length)}</span>
            )}
          </span>
          {change.reverted === null && change.affected.length > 0 && (
            <button
              type="button"
              className="of-button of-button--ghost of-agent-changes__show"
              data-testid="agent-change-show"
              aria-label={`Show what “${change.label}” changed`}
              onClick={() => {
                state.show(change)
                onShown?.()
              }}
            >
              Show
            </button>
          )}
          {change.reverted !== null ? (
            <span className="of-agent-changes__done">
              Taken back{change.reverted.by === null ? '' : ` by ${change.reverted.by}`}
              {(state.kept.get(change.id) ?? 0) > 0 && (
                <span className="of-agent-changes__kept" data-testid="agent-change-kept">
                  {objects(state.kept.get(change.id) ?? 0)} kept, changed since
                </span>
              )}
            </span>
          ) : (
            state.editing && (
              <button
                type="button"
                className="of-button of-agent-changes__revert"
                data-testid="agent-change-revert"
                aria-label={`Revert “${change.label}”`}
                onClick={(event) => {
                  const row = event.currentTarget.closest('li')
                  state.revert(change)
                  /*
                   * The button leaves with what it took back, so the keyboard
                   * stays on its row — which now says who took it back — rather
                   * than falling to the page.
                   */
                  requestAnimationFrame(() => {
                    if (row !== null && row.isConnected && !row.contains(document.activeElement))
                      row.focus()
                  })
                }}
              >
                Revert
              </button>
            )
          )}
        </li>
      ))}
    </ul>
  )
}

/** Whose agent made it, in the words a person would use. */
function whose(change: LoggedChange): string {
  return change.by === null ? 'An agent' : `${change.by}’s agent`
}

function objects(count: number): string {
  return `${String(count)} ${count === 1 ? 'object' : 'objects'}`
}
