import { useState } from 'react'

import { shareLink } from '../app/collab-config.js'
import { useMentions } from '../hooks/use-mentions.js'

/**
 * What somebody wanted you to see.
 *
 * On the front door rather than inside a board, because the whole point of a
 * mention is to reach you when you are NOT on the board it was left on. A
 * notification you only see once you are already looking at the thing is not a
 * notification.
 *
 * Reading one marks it read and takes you to the board. There is no separate
 * "mark all read": a list you can dismiss without looking is a list people
 * dismiss without looking, and the unread state is the only thing making these
 * worth showing at all.
 */
export function Mentions() {
  const { mentions, keyFor, markRead } = useMentions()
  const [open, setOpen] = useState(false)

  if (mentions.length === 0) return null

  return (
    <div className="of-mentions">
      <button
        type="button"
        className="of-mentions__bell"
        aria-expanded={open}
        data-testid="mentions-button"
        onClick={() => {
          setOpen((current) => !current)
        }}
      >
        {mentions.length} {mentions.length === 1 ? 'mention' : 'mentions'}
      </button>

      {open && (
        <ul className="of-mentions__list" data-testid="mentions-list">
          {mentions.map((mention) => (
            <li key={mention.commentId}>
              <a
                className="of-mentions__item"
                href={shareLink(mention.boardId, '', keyFor(mention.boardId))}
                data-testid={`mention-${mention.commentId}`}
                onClick={() => {
                  markRead(mention.commentId)
                }}
              >
                <span className="of-mentions__who">{mention.authorName}</span>
                <span className="of-mentions__where">{mention.boardTitle}</span>
                <span className="of-mentions__what">{mention.body.slice(0, 120)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
