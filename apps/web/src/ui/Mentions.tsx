import { useEffect, useRef, useState } from 'react'

import { shareLink } from '../app/collab-config.js'
import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { plainMentionText } from '../hooks/use-comments.js'
import { useMentions } from '../hooks/use-mentions.js'
import { useViewportSize } from '../hooks/use-viewport-size.js'

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
  const { mentions, keyFor, markRead } = useMentions()
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const bell = useRef<HTMLButtonElement>(null)
  const viewport = useViewportSize()

  /*
   * The bar this sits in moves when the window does, so a rectangle captured
   * at the moment of opening would leave the list behind. Measured in an
   * effect rather than during render, which is both the rule and the reason
   * for it: a ref holds no value React is allowed to re-render on.
   */
  useEffect(() => {
    if (!open) return
    setAnchor(bell.current?.getBoundingClientRect() ?? null)
  }, [open, viewport])

  if (mentions.length === 0) return null

  return (
    <div className="of-mentions">
      <button
        ref={bell}
        type="button"
        className="of-mentions__bell"
        aria-expanded={open}
        data-testid="mentions-button"
        onClick={(event) => {
          // Measured here too, so the first render after opening already has
          // it — the effect above is what keeps it true afterwards.
          setAnchor(event.currentTarget.getBoundingClientRect())
          setOpen((current) => !current)
        }}
      >
        {mentions.length} {mentions.length === 1 ? 'mention' : 'mentions'}
      </button>

      {open && (
        <AnchoredSurface
          anchor={anchor}
          surface={viewport}
          prefer={['below', 'above']}
          testId="mentions-surface"
        >
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
