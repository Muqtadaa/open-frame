import { useState } from 'react'

import { commentLink } from '../app/collab-config.js'
import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { plainMentionText } from '../hooks/use-comments.js'
import { useAnchoredTo } from '../controls/use-anchor.js'
import { useMentions } from '../hooks/use-mentions.js'

/**
 * What somebody wanted you to see.
 *
 * On the front door AND in the board's status bar, because the whole point of
 * a mention is to reach you when you are not on the board it was left on —
 * which cuts both ways: most of the time you are on a DIFFERENT board, not at
 * home.
 *
 * Reading one marks it read and takes you to the board. There is no separate
 * "mark all read": a list you can dismiss without looking is a list people
 * dismiss without looking, and the unread state is the only thing making these
 * worth showing at all.
 *
 * The list goes through `AnchoredSurface` rather than placing itself. It used
 * to open downward from the bell with `top: calc(100% + 6px)`, which was right
 * beneath a header and put the entire list below the bottom of the window as
 * soon as the same bell appeared in the status bar. Neither direction is
 * correct in both places, so neither is written down.
 */
export function Mentions() {
  const { mentions, unread, keyFor, markRead } = useMentions()
  const [open, setOpen] = useState(false)
  const { ref: bell, anchor, surface } = useAnchoredTo<HTMLButtonElement>(open)

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
        {unread === 0 ? 'Mentions' : `${String(unread)} ${unread === 1 ? 'mention' : 'mentions'}`}
      </button>

      {open && (
        <AnchoredSurface
          anchor={anchor}
          surface={surface}
          prefer={['below', 'above']}
          testId="mentions-surface"
        >
          <ul className="of-mentions__list" data-testid="mentions-list">
            {mentions.map((mention) => (
              <li key={mention.commentId}>
                <a
                  className={
                    mention.readAt === null
                      ? 'of-mentions__item'
                      : 'of-mentions__item is-read'
                  }
                  href={commentLink(mention.boardId, '', keyFor(mention.boardId), mention.commentId)}
                  data-testid={`mention-${mention.commentId}`}
                  data-unread={mention.readAt === null ? 'true' : 'false'}
                  onClick={() => {
                    markRead(mention.commentId)
                  }}
                >
                  <span className="of-mentions__who">{mention.authorName}</span>
                  <span className="of-mentions__where">{mention.boardTitle}</span>
                  <span className="of-mentions__what">
                    {plainMentionText(mention.body).slice(0, 120)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </AnchoredSurface>
      )}
    </div>
  )
}
