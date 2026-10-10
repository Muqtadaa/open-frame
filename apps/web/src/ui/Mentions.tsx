import { useEffect, useRef, useState } from 'react'

import { commentLink } from '../app/collab-config.js'
import { useDiscussion } from '../app/comments-context.js'
import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { useEscapeToClose } from '../controls/escape-stack.js'
import { Ago } from './Ago.js'
import { plainMentionText } from '../hooks/use-comments.js'
import { useAnchoredTo } from '../controls/use-anchor.js'
import { stepFocus } from '../controls/roving.js'
import { useMentions } from '../hooks/use-mentions.js'
import { counted } from '../controls/counted.js'

/**
 * What somebody wanted you to see.
 *
 * On the front door as this bell, and on a board in the inbox (`Inbox`),
 * because the whole point of a mention is to reach you when you are not on
 * the board it was left on — which cuts both ways: most of the time you are
 * on a DIFFERENT board, not at home.
 *
 * Reading one marks it read and takes you to the board. There is no separate
 * "mark all read": a list you can dismiss without looking is a list people
 * dismiss without looking, and the unread state is the only thing making these
 * worth showing at all.
 *
 * The list goes through `AnchoredSurface` rather than placing itself. It used
 * to open downward from the bell with `top: calc(100% + 6px)`, which was right
 * beneath a header and put the entire list below the bottom of the window
 * when the same bell also sat in the status bar. Neither direction is correct
 * in both places, so neither is written down. On a board, mentions are now a
 * section of the Inbox (`Inbox.tsx`); this bell is the front door's.
 */
export function Mentions() {
  const { mentions, unread, keyFor, markRead } = useMentions()
  const [open, setOpen] = useState(false)
  const { ref: bell, anchor, surface } = useAnchoredTo<HTMLButtonElement>(open)
  const list = useRef<HTMLDivElement>(null)

  /*
   * A sheet like the account and share sheets: the keyboard goes in when it
   * opens, and Escape or a press anywhere else closes it and hands the
   * keyboard back to the bell. It did none of that — it opened with focus left
   * on the bell, eleven Tabs from its first item on the front door, and
   * nothing but the bell itself would close it.
   */
  // Escape through the one stack, which also keeps it from the board's keymap
  // (Escape there clears the selection). A listener of its own closed any
  // sheet opened after the list as well.
  useEscapeToClose(() => {
    setOpen(false)
    bell.current?.focus()
  }, open)
  useEffect(() => {
    if (!open) return
    const outside = (event: Event): void => {
      if (!(event.target instanceof Node)) return
      if (list.current?.contains(event.target) === true) return
      if (bell.current?.contains(event.target) === true) return
      setOpen(false)
    }
    window.addEventListener('pointerdown', outside, true)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
    }
  }, [open, bell])

  // In once the list is PLACED: the surface renders a frame after the bell
  // is measured, and a focus asked for before then finds nothing to take it.
  const placed = anchor !== null
  useEffect(() => {
    if (open && placed) list.current?.querySelector<HTMLElement>('a')?.focus()
  }, [open, placed])

  if (mentions.length === 0) return null

  return (
    <div className="of-mentions">
      {/*
       * The COUNT is the unread; the list is everything recent.
       *
       * Read and gone were the same state until now, so following a
       * notification was the last time you could find it. They are kept, and
       * the bell goes quiet rather than disappearing — an old mention is
       * still the only link back to the remark it named.
       */}
      <button
        ref={bell}
        type="button"
        className={unread === 0 ? 'of-mentions__bell is-read' : 'of-mentions__bell'}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          unread === 0
            ? `Mentions, none unread, ${String(mentions.length)} recent`
            : `${String(unread)} unread ${unread === 1 ? 'mention' : 'mentions'}`
        }
        data-testid="mentions-button"
        onClick={() => {
          setOpen((current) => !current)
        }}
      >
        {unread === 0 ? 'Mentions' : `${counted(unread, 'mention')}`}
      </button>

      {open && (
        <AnchoredSurface
          anchor={anchor}
          surface={surface}
          prefer={['below', 'above']}
          testId="mentions-surface"
        >
          <div
            ref={list}
            role="dialog"
            aria-label="Mentions"
            onKeyDown={(event) => {
              // Up and down the list, wrapping, as every other list here does.
              stepFocus(event, { items: 'a' })
            }}
          >
            <MentionItems
              mentions={mentions}
              keyFor={keyFor}
              markRead={markRead}
              onFollowed={() => {
                setOpen(false)
              }}
            />
          </div>
        </AnchoredSurface>
      )}
    </div>
  )
}

/**
 * The mentions themselves: each one marks itself read and goes to its remark,
 * on this board without a reload when it is the board you are on.
 */
export function MentionItems({
  mentions,
  keyFor,
  markRead,
  onFollowed,
}: {
  readonly mentions: ReturnType<typeof useMentions>['mentions']
  readonly keyFor: ReturnType<typeof useMentions>['keyFor']
  readonly markRead: ReturnType<typeof useMentions>['markRead']
  /** Called once a mention has been followed on this board, so its sheet can close. */
  readonly onFollowed: () => void
}) {
  /*
   * The board under this list, and the way to go to a remark on it. Empty on
   * the front door, where the context has no provider and answers "no
   * discussion" rather than throwing — which is why this comes from here
   * rather than from the runtime, and why the list can be in both places.
   */
  const { boardId: here, focusComment } = useDiscussion()
  return (
    <ul className="of-mentions__list" data-testid="mentions-list">
      {mentions.map((mention) => (
        <li key={mention.commentId}>
          <a
            className={mention.readAt === null ? 'of-mentions__item' : 'of-mentions__item is-read'}
            href={commentLink(mention.boardId, '', keyFor(mention.boardId), mention.commentId)}
            data-testid={`mention-${mention.commentId}`}
            data-unread={mention.readAt === null ? 'true' : 'false'}
            data-here={mention.boardId === here ? 'true' : 'false'}
            onClick={(event) => {
              markRead(mention.commentId)
              /*
               * Already HERE: go to the remark instead of reloading the
               * board you are standing on. A full page load throws away
               * the socket, the document and the view for a board the
               * browser already has open, and the only thing it
               * achieves is arriving at the same place slower.
               *
               * A modified click is left alone — that is somebody
               * asking for a new tab, and the link still works there.
               */
              if (
                mention.boardId !== here ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey ||
                event.button !== 0
              ) {
                return
              }
              /*
               * Only take the click if there is somewhere to take it
               * TO. The discussion loads asynchronously, so a click in
               * the first moment of a board finds nothing — and a
               * prevented click that then does nothing is worse than
               * the reload it was saving, because it looks like the
               * notification is broken. The link still works, and the
               * fresh page honours `?c=` on the way in.
               */
              if (!focusComment(mention.commentId)) return
              event.preventDefault()
              onFollowed()
            }}
          >
            <span className="of-mentions__who">{mention.authorName}</span>
            <span className="of-mentions__where">
              {mention.boardTitle} · <Ago at={mention.createdAt} />
            </span>
            <span className="of-mentions__what">
              {plainMentionText(mention.body).slice(0, 120)}
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}
