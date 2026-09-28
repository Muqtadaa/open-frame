import type { LoggedChange } from '@openframe/collab'
import type { TransactionId } from '@openframe/core'
import { useCallback, useEffect, useRef, useState } from 'react'

import { guestIdentity } from '../app/guest.js'

import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { useAnchoredTo } from '../controls/use-anchor.js'
import { useCommands } from '../hooks/use-commands.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { Ago } from './Ago.js'

/**
 * What agents have done to this board, and a way to take any of it back
 * (tracks A-2).
 *
 * An agent's change reached the board with nothing attached — no name, no
 * boundary, no undo — so a person could only watch it happen. The board's
 * change log carries all three now. This lists it, and says so the moment a
 * new change lands: a toast with Revert on it, because that is when somebody
 * is looking, and this panel for after the toast has gone.
 *
 * Absent on a board with no room, and on one nothing but people have touched:
 * a control for something that has never happened is a control people learn
 * to ignore.
 */
export function AgentChanges() {
  const { runtime, collaboration } = useOpenFrame()
  const commands = useCommands()
  const [changes, setChanges] = useState<readonly LoggedChange[]>([])
  const [role, setRole] = useState(collaboration?.role ?? 'editor')
  const [open, setOpen] = useState(false)
  const { ref: button, anchor, surface } = useAnchoredTo<HTMLButtonElement>(open)
  const sheet = useRef<HTMLDivElement>(null)
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

  const revert = useCallback(
    (change: LoggedChange): void => {
      const done = commands.revertChange(change)
      if (done !== null) reverts.current.set(done, change.id)
    },
    [commands],
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

  // A sheet like Mentions: the keyboard goes in, Escape or a press elsewhere
  // closes it, and the keyboard goes back to the button.
  useEffect(() => {
    if (!open) return
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      button.current?.focus()
    }
    const outside = (event: Event): void => {
      if (!(event.target instanceof Node)) return
      if (sheet.current?.contains(event.target) === true) return
      if (button.current?.contains(event.target) === true) return
      setOpen(false)
    }
    window.addEventListener('keydown', escape, true)
    window.addEventListener('pointerdown', outside, true)
    return () => {
      window.removeEventListener('keydown', escape, true)
      window.removeEventListener('pointerdown', outside, true)
    }
  }, [open, button])

  const placed = anchor !== null
  useEffect(() => {
    // The first Revert, or the sheet itself when there is nothing to press —
    // a viewer's, or one where everything has been taken back already.
    if (!open || !placed) return
    ;(sheet.current?.querySelector<HTMLElement>('button') ?? sheet.current)?.focus()
  }, [open, placed])

  if (collaboration === null || collaboration === undefined || changes.length === 0) return null

  const pending = changes.filter((change) => change.reverted === null).length
  const editing = role !== 'viewer'

  return (
    <div className="of-agent-changes">
      <button
        ref={button}
        type="button"
        className={pending === 0 ? 'of-mentions__bell is-read' : 'of-mentions__bell'}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          pending === 0
            ? `Agent changes, ${String(changes.length)} recent, all taken back`
            : `Agent changes, ${String(pending)} not taken back`
        }
        data-testid="agent-changes-button"
        onClick={() => {
          setOpen((current) => !current)
        }}
      >
        {pending === 0
          ? 'Agent changes'
          : `${String(pending)} agent ${pending === 1 ? 'change' : 'changes'}`}
      </button>

      {open && (
        <AnchoredSurface
          anchor={anchor}
          surface={surface}
          prefer={['below', 'above']}
          testId="agent-changes-surface"
        >
          <div ref={sheet} role="dialog" aria-label="Agent changes" tabIndex={-1}>
            <ul className="of-mentions__list" data-testid="agent-changes-list">
              {changes.map((change) => (
                <li
                  key={change.id}
                  className="of-agent-changes__item"
                  data-testid={`agent-change-${change.id}`}
                  data-reverted={change.reverted === null ? 'false' : 'true'}
                >
                  <span className="of-mentions__who">{change.label}</span>
                  <span className="of-mentions__where">
                    {whose(change)} · <Ago at={change.at} /> · {objects(change.affected.length)}
                  </span>
                  {change.reverted !== null ? (
                    <span className="of-agent-changes__done">
                      Taken back{change.reverted.by === null ? '' : ` by ${change.reverted.by}`}
                    </span>
                  ) : (
                    editing && (
                      <button
                        type="button"
                        className="of-button of-agent-changes__revert"
                        data-testid="agent-change-revert"
                        aria-label={`Revert “${change.label}”`}
                        onClick={() => {
                          revert(change)
                        }}
                      >
                        Revert
                      </button>
                    )
                  )}
                </li>
              ))}
            </ul>
          </div>
        </AnchoredSurface>
      )}
    </div>
  )
}

/** Whose agent made it, in the words a person would use. */
function whose(change: LoggedChange): string {
  return change.by === null ? 'An agent' : `${change.by}’s agent`
}

function objects(count: number): string {
  return `${String(count)} ${count === 1 ? 'object' : 'objects'}`
}
