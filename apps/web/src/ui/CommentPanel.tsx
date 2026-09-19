import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import {
  postComment,
  resolveComment,
  type BoardComment,
  type BoardPerson,
} from '../adapters/supabase/comments.js'
import { repliesTo } from '../hooks/use-comments.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { hueVar } from '../scene/presence.js'

/**
 * Reading and writing one conversation.
 *
 * A panel rather than something drawn on the canvas: a thread is text of
 * arbitrary length, and text that scales with the board is text you cannot
 * read at 25%. The pin is on the board because that is WHERE the remark is
 * about; the words are in the margin because that is where words are legible.
 */
interface Props {
  readonly comments: readonly BoardComment[]
  readonly people: readonly BoardPerson[]
  readonly onChanged: () => void
}

export function CommentPanel({ comments, people, onChanged }: Props) {
  const { runtime } = useOpenFrame()
  const composing = useInteractionStore((state) => state.composing)
  const openThreadId = useInteractionStore((state) => state.openThreadId)
  const startComment = useInteractionStore((state) => state.startComment)
  const openThread = useInteractionStore((state) => state.openThread)

  const thread = useMemo(
    () => comments.find((comment) => comment.id === openThreadId) ?? null,
    [comments, openThreadId],
  )
  const replies = useMemo(
    () => (thread === null ? [] : repliesTo(comments, thread.id)),
    [comments, thread],
  )

  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  // A composer that opens without focus is a composer you have to click twice.
  useEffect(() => {
    if (composing !== null || thread !== null) input.current?.focus()
  }, [composing, thread])

  // Whatever was half-typed belongs to the thing it was being typed into.
  useEffect(() => {
    setBody('')
    setProblem(null)
  }, [composing, openThreadId])

  if (composing === null && thread === null) return null

  /**
   * Who this text mentions.
   *
   * Matched against the people actually on the board rather than parsed as
   * free text: a mention is a notification, and a notification to a name
   * nobody has is a message that silently goes nowhere. The longest name wins
   * so that "@Sam" does not shadow "@Samira".
   */
  const mentioned = (text: string): string[] => {
    const found: string[] = []
    const byLongest = [...people].sort((a, b) => b.displayName.length - a.displayName.length)
    for (const person of byLongest) {
      if (text.toLowerCase().includes(`@${person.displayName.toLowerCase()}`)) {
        found.push(person.userId)
      }
    }
    return found
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    const text = body.trim()
    if (text === '' || busy) return
    setBusy(true)
    setProblem(null)

    const write =
      thread !== null
        ? postComment({
            boardId: runtime.boardId,
            body: text,
            parentId: thread.id,
            mentions: mentioned(text),
          })
        : composing === null
          ? Promise.resolve(null)
          : postComment({
              boardId: runtime.boardId,
              body: text,
              at: { x: composing.x, y: composing.y },
              objectId: composing.objectId,
              mentions: mentioned(text),
            })

    void write.then((id) => {
      setBusy(false)
      if (id === null) {
        setProblem('That could not be saved. A board you are a member of takes comments.')
        return
      }
      setBody('')
      onChanged()
      // Writing a thread leaves it open to read; replying keeps you where you
      // are. Either way the composer is done.
      if (thread === null) startComment(null)
    })
  }

  const attachedTo = thread?.objectId ?? composing?.objectId ?? null
  const attachmentGone =
    attachedTo !== null && !runtime.store.getDocument().objects.has(attachedTo)

  return (
    <aside className="of-comment-panel" aria-label="Comments" data-testid="comment-panel">
      <header className="of-comment-panel__head">
        <h2 className="of-comment-panel__title">{thread === null ? 'New comment' : 'Comment'}</h2>
        <button
          type="button"
          className="of-button of-button--ghost"
          data-testid="comment-close"
          onClick={() => {
            startComment(null)
            openThread(null)
          }}
        >
          Close
        </button>
      </header>

      {/*
        * An element that has since been deleted is SAID, not hidden. The
        * comment stays where it was put — its coordinates never depended on
        * the object — and the remark still means something even when the thing
        * it was about does not exist any more.
        */}
      {attachmentGone && (
        <p className="of-comment-panel__gone" data-testid="comment-orphaned">
          What this was attached to has been deleted.
        </p>
      )}

      {thread !== null && (
        <div className="of-comment-panel__thread">
          <Remark comment={thread} />
          {replies.map((reply) => (
            <Remark key={reply.id} comment={reply} />
          ))}
        </div>
      )}

      <form onSubmit={submit}>
        <textarea
          ref={input}
          className="of-comment-panel__input"
          rows={3}
          value={body}
          maxLength={4000}
          disabled={busy}
          placeholder={thread === null ? 'Say something' : 'Reply'}
          aria-label={thread === null ? 'Your comment' : 'Your reply'}
          data-testid="comment-input"
          onChange={(event) => {
            setBody(event.target.value)
          }}
        />

        {people.length > 1 && (
          <p className="of-comment-panel__hint">
            Type @ and a name to notify someone: {people.map((p) => p.displayName).join(', ')}
          </p>
        )}

        {problem !== null && (
          <p className="of-comment-panel__problem" role="alert" data-testid="comment-problem">
            {problem}
          </p>
        )}

        <div className="of-comment-panel__actions">
          <button
            type="submit"
            className="of-button of-button--primary"
            disabled={busy || body.trim() === ''}
            data-testid="comment-post"
          >
            {thread === null ? 'Comment' : 'Reply'}
          </button>

          {thread !== null && (
            <button
              type="button"
              className="of-button of-button--ghost"
              data-testid="comment-resolve"
              onClick={() => {
                setBusy(true)
                void resolveComment(thread.id, thread.resolvedAt === null).then((ok) => {
                  setBusy(false)
                  if (!ok) {
                    setProblem('That could not be changed.')
                    return
                  }
                  onChanged()
                  openThread(null)
                })
              }}
            >
              {thread.resolvedAt === null ? 'Resolve' : 'Reopen'}
            </button>
          )}
        </div>
      </form>
    </aside>
  )
}

function Remark({ comment }: { readonly comment: BoardComment }) {
  return (
    <article className="of-comment">
      <span className="of-comment__who" style={{ background: hueVar(comment.authorHue) }}>
        {(comment.authorName.trim()[0] ?? '?').toUpperCase()}
      </span>
      <div className="of-comment__body">
        <span className="of-comment__name">{comment.authorName}</span>
        <p className="of-comment__text">{comment.body}</p>
      </div>
    </article>
  )
}
