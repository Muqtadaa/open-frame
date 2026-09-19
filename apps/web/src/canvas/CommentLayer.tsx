import { useMemo } from 'react'

import type { Point } from '@openframe/core'

import { useDiscussion } from '../app/comments-context.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useRemoteDragStore } from '../interaction/remote-drags.js'
import { useOpenFrame } from '../runtime/context.js'
import { pinPosition } from '../scene/comment-pin.js'

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
 *
 * A pin on an element RIDES it. Its stored fraction is resolved against the
 * element's bounds every render, so moving or resizing the thing takes the
 * remark about it along — and an element that has been deleted falls back to
 * where the pin was dropped, because the discussion outlives what it was
 * about.
 */
export function CommentLayer() {
  const { comments, replyCounts, enabled } = useDiscussion()
  const { runtime } = useOpenFrame()
  const document = useBoardDocument()
  const zoom = useInteractionStore((state) => state.viewport.zoom)
  const openThreadId = useInteractionStore((state) => state.openThreadId)
  const openThread = useInteractionStore((state) => state.openThread)
  const composing = useInteractionStore((state) => state.composing)

  /*
   * A gesture in flight, mine and everybody else's.
   *
   * Rule 4 says the document does not move until a drag commits, so bounds
   * read from it are where the element STARTED. Without these the pin sits
   * still while the note slides out from under it and then jumps on release —
   * the same fault the peer selection outlines had, and the same fix.
   *
   * Primitives and stable references only: a selector returning a fresh
   * object never compares equal under `Object.is`, and `useSyncExternalStore`
   * then re-renders forever. Rule 9, which crashed this app once.
   */
  const dragging = useInteractionStore((state) => state.drag.kind === 'translate')
  const myDx = useInteractionStore((state) => (state.drag.kind === 'translate' ? state.drag.dx : 0))
  const myDy = useInteractionStore((state) => (state.drag.kind === 'translate' ? state.drag.dy : 0))
  const selection = useInteractionStore((state) => state.selection)
  const remoteDrags = useRemoteDragStore((state) => state.drags)

  const held = useMemo(
    () => (dragging ? new Set<string>(selection) : null),
    [dragging, selection],
  )

  /*
   * Resolved threads are hidden rather than greyed. A board that keeps every
   * finished discussion pinned accumulates them until nobody reads any of
   * them; reopening one is what the panel offers.
   */
  const pins = useMemo(() => {
    const placed: { id: string; at: Point; authorName: string; body: string }[] = []
    for (const comment of comments) {
      if (comment.parentId !== null || comment.resolvedAt !== null) continue

      const object = comment.objectId === null ? undefined : document.objects.get(comment.objectId)
      /*
       * `boundsOf`, never `object.frame`: a connector has no meaningful frame
       * and asking for one draws a degenerate box at the origin — which the
       * selection overlay got wrong once already.
       */
      const bounds = object === undefined ? null : runtime.registry.boundsOf(object, document)
      const at = pinPosition(comment, bounds)
      if (at === null) continue

      const moving =
        comment.objectId === null
          ? null
          : (held?.has(comment.objectId) === true ? { dx: myDx, dy: myDy } : null) ??
            remoteDrags.get(comment.objectId) ??
            null

      placed.push({
        id: comment.id,
        at: moving === null ? at : { x: at.x + moving.dx, y: at.y + moving.dy },
        authorName: comment.authorName,
        body: comment.body,
      })
    }
    return placed
  }, [comments, document, runtime, held, myDx, myDy, remoteDrags])

  if (!enabled) return null
  if (pins.length === 0 && composing === null) return null

  return (
    <div className="of-comments">
      {pins.map((pin) => {
        const replies = replyCounts.get(pin.id) ?? 0
        return (
          <button
            key={pin.id}
            type="button"
            className={`of-comments__pin${
              openThreadId === pin.id ? ' of-comments__pin--open' : ''
            }`}
            style={{
              transform: `translate(${String(pin.at.x)}px, ${String(pin.at.y)}px) scale(${String(1 / zoom)})`,
            }}
            title={`${pin.authorName}: ${pin.body.slice(0, 80)}`}
            aria-label={`Comment from ${pin.authorName}${
              replies > 0 ? `, ${String(replies)} replies` : ''
            }`}
            data-testid={`comment-pin-${pin.id}`}
            onClick={() => {
              openThread(openThreadId === pin.id ? null : pin.id)
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
