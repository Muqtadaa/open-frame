import { useDiscussion } from '../app/comments-context.js'
import { useInteractionStore } from '../interaction/interaction-store.js'

/**
 * The pins: where the conversations are.
 *
 * World space, like the presence layer, so they track the board exactly — and
 * counter-scaled so a pin stays the same size on screen. A pin that shrank
 * with the board would be a dot at 25%, which is the same reasoning the
 * cursors follow.
 *
 * These ARE interactive, unlike presence: a pin is the only way to open the
 * thread under it. So the layer itself takes no pointer events and each pin
 * takes its own — otherwise an invisible sheet over the whole board would
 * swallow every click aimed at the canvas.
 */
export function CommentLayer() {
  const { comments, replyCounts, enabled } = useDiscussion()
  /*
   * Resolved threads are hidden rather than greyed. A board that keeps every
   * finished discussion pinned accumulates them until nobody reads any of
   * them; reopening one is what the panel offers.
   */
  const threads = comments.filter(
    (comment) => comment.parentId === null && comment.resolvedAt === null,
  )
  const zoom = useInteractionStore((state) => state.viewport.zoom)
  const openThreadId = useInteractionStore((state) => state.openThreadId)
  const openThread = useInteractionStore((state) => state.openThread)
  const composing = useInteractionStore((state) => state.composing)

  if (!enabled) return null
  if (threads.length === 0 && composing === null) return null

  return (
    <div className="of-comments">
      {threads.map((thread) => {
        // A thread always has a pin; a reply never does. The guard is for the
        // type rather than for the data.
        if (thread.x === null || thread.y === null) return null
        const replies = replyCounts.get(thread.id) ?? 0
        return (
          <button
            key={thread.id}
            type="button"
            className={`of-comments__pin${
              openThreadId === thread.id ? ' of-comments__pin--open' : ''
            }`}
            style={{
              transform: `translate(${String(thread.x)}px, ${String(thread.y)}px) scale(${String(1 / zoom)})`,
            }}
            title={`${thread.authorName}: ${thread.body.slice(0, 80)}`}
            aria-label={`Comment from ${thread.authorName}${
              replies > 0 ? `, ${String(replies)} replies` : ''
            }`}
            data-testid={`comment-pin-${thread.id}`}
            onClick={() => {
              openThread(openThreadId === thread.id ? null : thread.id)
            }}
          >
            {replies > 0 ? String(replies + 1) : ''}
          </button>
        )
      })}

      {/* Where a new one is being written, before it exists anywhere. */}
      {composing !== null && (
        <span
          className="of-comments__pin of-comments__pin--new"
          style={{
            transform: `translate(${String(composing.x)}px, ${String(composing.y)}px) scale(${String(1 / zoom)})`,
          }}
          aria-hidden="true"
          data-testid="comment-pin-new"
        />
      )}
    </div>
  )
}
