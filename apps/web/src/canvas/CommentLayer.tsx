import { useMemo } from 'react'

import { worldToScreen, type Point } from '@openframe/core'

import { useDiscussion } from '../app/comments-context.js'
import { plainMentionText } from '../hooks/use-comments.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { draftIsBy, draftKey, useCommentDrafts } from '../interaction/comment-drafts.js'
import { useIdentity } from '../hooks/use-identity.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useRemoteDragStore } from '../interaction/remote-drags.js'
import { useOpenFrame } from '../runtime/context.js'
import { pinPosition } from '../scene/comment-pin.js'

/**
 * The pins: where the conversations are.
 *
 * On the apparatus layer, like every other constant-size thing: a pin that
 * shrank with the board would be a dot at 25%. Its POSITION is the world's and
 * is converted here, so a pin still sits exactly where it was dropped under
 * any pan or zoom.
 *
 * Above the selection's grips rather than under them, which is the reason it
 * is here and not in the world: a pin dropped on the edge of an object
 * disappeared beneath that object's handles as soon as the object was
 * selected, and a pin is the only way to open the thread under it.
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
  const viewport = useInteractionStore((state) => state.viewport)
  const openThreadId = useInteractionStore((state) => state.openThreadId)
  const openThread = useInteractionStore((state) => state.openThread)
  const composing = useInteractionStore((state) => state.composing)
  const startComment = useInteractionStore((state) => state.startComment)
  const drafts = useCommentDrafts((state) => state.drafts)
  const author = useIdentity()?.userId ?? null

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

  const held = useMemo(() => (dragging ? new Set<string>(selection) : null), [dragging, selection])

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
          : ((held?.has(comment.objectId) === true ? { dx: myDx, dy: myDy } : null) ??
            remoteDrags.get(comment.objectId) ??
            null)

      placed.push({
        id: comment.id,
        at: moving === null ? at : { x: at.x + moving.dx, y: at.y + moving.dy },
        authorName: comment.authorName,
        body: comment.body,
      })
    }
    return placed
  }, [comments, document, runtime, held, myDx, myDy, remoteDrags])

  /*
   * New comments left unposted, where they were started. A draft kept by
   * Escape has to be somewhere a person can find it again — nobody can click
   * the exact spot twice — so it stays on the board as a pin of its own.
   */
  const current = draftKey(author, openThreadId, composing)
  const pending = [...drafts]
    // Only this account's: another's unposted words are not yours to see.
    .filter(([key, draft]) => draft.at !== null && key !== current && draftIsBy(key, author))
    .map(([key, draft]) => {
      const start = draft.at
      if (start === null) return null
      const object = start.objectId === null ? undefined : document.objects.get(start.objectId)
      const bounds = object === undefined ? null : runtime.registry.boundsOf(object, document)
      const at = pinPosition(
        { x: start.x, y: start.y, fx: start.on?.fx ?? null, fy: start.on?.fy ?? null },
        bounds,
      )
      return at === null ? null : { key, start, at, body: draft.body }
    })
    .filter((draft) => draft !== null)

  if (!enabled) return null
  if (pins.length === 0 && composing === null && pending.length === 0) return null

  return (
    <div className="of-comments">
      {pins.map((pin) => {
        const replies = replyCounts.get(pin.id) ?? 0
        const at = worldToScreen(viewport, pin.at)
        /*
         * Who, what, and — when there is more than the one remark — how many,
         * counted as the pin counts them. The label said "1 replies" beside a
         * pin reading "2", and the excerpt lived only in a mouse-only title.
         */
        const label = `Comment from ${pin.authorName}: ${plainMentionText(pin.body).slice(0, 80)}${
          replies > 0 ? ` (${String(replies + 1)} messages)` : ''
        }`
        return (
          <button
            key={pin.id}
            type="button"
            className={`of-comments__pin${
              openThreadId === pin.id ? ' of-comments__pin--open' : ''
            }`}
            style={{
              transform: `translate(${String(at.x)}px, ${String(at.y)}px)`,
            }}
            data-tip={label}
            aria-label={label}
            data-testid={`comment-pin-${pin.id}`}
            onClick={() => {
              openThread(openThreadId === pin.id ? null : pin.id)
            }}
          >
            {replies > 0 ? String(replies + 1) : ''}
          </button>
        )
      })}

      {pending.map((draft) => {
        const at = worldToScreen(viewport, draft.at)
        const said = `Unposted: ${draft.body.slice(0, 80)}`
        return (
          <button
            key={draft.key}
            type="button"
            className="of-comments__pin of-comments__pin--draft"
            style={{ transform: `translate(${String(at.x)}px, ${String(at.y)}px)` }}
            aria-label="Your unposted comment"
            data-tip={said}
            aria-description={said}
            data-testid="comment-pin-draft"
            onClick={() => {
              startComment(draft.start)
            }}
          />
        )
      })}

      {/* Where a new one is being written, before it exists anywhere. */}
      {composing !== null && (
        <span
          className="of-comments__pin of-comments__pin--new"
          style={{
            transform: (({ x, y }) => `translate(${String(x)}px, ${String(y)}px)`)(
              worldToScreen(viewport, composing),
            ),
          }}
          aria-hidden="true"
          data-testid="comment-pin-new"
        />
      )}
    </div>
  )
}
