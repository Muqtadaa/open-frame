import { useCallback, useEffect, useId, useRef, useState } from 'react'

import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { InboxIcon } from '../controls/icons.js'
import { useAnchoredTo } from '../controls/use-anchor.js'
import { useDismiss } from '../controls/use-dismiss.js'
import { useMentions } from '../hooks/use-mentions.js'
import { AgentChangeItems, useAgentChanges } from './AgentChanges.js'
import { focusTheBoard } from './hand-back-focus.js'
import { MentionItems } from './Mentions.js'
import { wrapTab } from '../controls/wrap-tab.js'

/**
 * What has happened that is for you: mentions, and what agents did to the
 * board. One count, one sheet, a section each.
 *
 * They were two buttons side by side in the same style — "2 mentions",
 * "1 agent change" — two words of bar for one question, "is anything waiting
 * for me?". The count is the unread mentions plus the agent changes still on
 * the board that this browser has not yet been shown; each section keeps its
 * own list exactly as it was.
 *
 * Absent while there is nothing in either: a control for something that has
 * never happened is a control people learn to ignore.
 */
export function Inbox() {
  const mentions = useMentions()
  // Mounted on every board, empty or not: it is also what toasts a new change.
  const agents = useAgentChanges()
  const [open, setOpen] = useState(false)
  const { ref: button, anchor, surface } = useAnchoredTo<HTMLButtonElement>(open)
  const sheet = useRef<HTMLDivElement>(null)
  const mentionsHeading = useId()
  const agentsHeading = useId()
  const close = useCallback(() => {
    setOpen(false)
    button.current?.focus()
  }, [button])
  useDismiss(sheet, button, close, open)

  /*
   * Looked at is read: once the sheet has been open, the agent changes in it
   * are no longer news in this browser. Marked as it CLOSES, so what was new
   * stays marked while somebody is reading it. A mention is read by following
   * it, as before — it points somewhere; an agent change has already happened.
   */
  const wasOpen = useRef(false)
  const { markSeen } = agents
  useEffect(() => {
    if (open) wasOpen.current = true
    else if (wasOpen.current) {
      wasOpen.current = false
      markSeen()
    }
  }, [open, markSeen])

  /*
   * In once the sheet is PLACED: at its first mention, which only goes
   * somewhere, or else at the sheet itself. Never at a Revert — opening the
   * Inbox and pressing Enter twice took a change back.
   */
  const placed = anchor !== null
  useEffect(() => {
    if (!open || !placed) return
    ;(sheet.current?.querySelector<HTMLElement>('a') ?? sheet.current)?.focus()
  }, [open, placed])

  if (mentions.mentions.length === 0 && agents.changes.length === 0) return null

  const waiting = mentions.unread + agents.unseen
  const name = waiting === 0 ? 'Inbox, nothing new' : `Inbox, ${String(waiting)} new`

  return (
    <div className="of-inbox">
      <button
        ref={button}
        type="button"
        className={waiting === 0 ? 'of-mentions__bell is-read' : 'of-mentions__bell'}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={name}
        data-tip={name}
        data-testid="inbox"
        onClick={() => {
          setOpen((current) => !current)
        }}
      >
        <InboxIcon
          className={waiting > 0 ? 'of-inbox__icon of-inbox__icon--news' : 'of-inbox__icon'}
        />
        <span className="of-inbox__word">Inbox</span>
        {waiting > 0 && (
          <span className="of-inbox__count" aria-hidden="true">
            {waiting}
          </span>
        )}
      </button>

      {open && (
        <AnchoredSurface
          anchor={anchor}
          surface={surface}
          prefer={['below', 'above']}
          testId="inbox-surface"
        >
          <div
            ref={sheet}
            className="of-inbox__sheet"
            role="dialog"
            aria-label="Inbox"
            tabIndex={-1}
            onKeyDown={(event) => {
              wrapTab(event)
              // Up and down everything in it, wrapping, as every list here does.
              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
              event.preventDefault()
              const stops = [...event.currentTarget.querySelectorAll<HTMLElement>('a, button')]
              const at = stops.indexOf(event.target as HTMLElement)
              const step = event.key === 'ArrowDown' ? 1 : -1
              stops[(at + step + stops.length) % stops.length]?.focus()
            }}
          >
            {mentions.mentions.length > 0 && (
              <section aria-labelledby={mentionsHeading}>
                <h2 className="of-inbox__heading" id={mentionsHeading}>
                  Mentions
                </h2>
                <MentionItems
                  mentions={mentions.mentions}
                  keyFor={mentions.keyFor}
                  markRead={mentions.markRead}
                  onFollowed={() => {
                    setOpen(false)
                  }}
                />
              </section>
            )}
            {agents.changes.length > 0 && (
              <section aria-labelledby={agentsHeading}>
                <h2 className="of-inbox__heading" id={agentsHeading}>
                  Agent changes
                </h2>
                <AgentChangeItems
                  state={agents}
                  onShown={() => {
                    setOpen(false)
                    focusTheBoard()
                  }}
                />
              </section>
            )}
          </div>
        </AnchoredSurface>
      )}
    </div>
  )
}
