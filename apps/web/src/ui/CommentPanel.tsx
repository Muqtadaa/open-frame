import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import { accessKey, shareLink } from '../app/collab-config.js'

import { useDiscussion } from '../app/comments-context.js'
import {
  mentionsIn,
  repliesTo,
  unknownMentionIn,
  type BoardComment,
} from '../hooks/use-comments.js'
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
export function CommentPanel() {
  const { comments, people, post, resolve } = useDiscussion()
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
  const [invited, setInvited] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)

  /** Somebody named in this draft who is not on the board, if anybody. */
  const stranger = useMemo(() => unknownMentionIn(body, people), [body, people])

  const copyInvite = (): void => {
    const link = shareLink(runtime.boardId, window.location.origin, accessKey(window.location.search))
    /*
     * The clipboard can REFUSE — a denied permission, an insecure origin, a
     * browser that only allows it from a trusted gesture it has decided this
     * is not. An unhandled rejection there is an uncaught error in the
     * console and a button that silently did nothing.
     */
    navigator.clipboard.writeText(link).then(
      () => {
        setInvited(true)
      },
      () => {
        setProblem(`The link could not be copied. It is ${link}`)
      },
    )
  }

  // A composer that opens without focus is a composer you have to click twice.
  useEffect(() => {
    if (composing !== null || thread !== null) input.current?.focus()
  }, [composing, thread])

  if (composing === null && thread === null) return null

  /**
   * Writes the comment, or the reply, and says so if it could not be written.
   *
   * Who it mentions is worked out by `mentionsIn`, which matches on a word
   * boundary — the description that used to sit here said the longest name
   * won, which was never what the code did and is not how the problem is
   * solved.
   */
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    const text = body.trim()
    if (text === '' || busy) return
    setBusy(true)
    setProblem(null)

    const write =
      thread !== null
        ? post({
            boardId: runtime.boardId,
            body: text,
            parentId: thread.id,
            mentions: mentionsIn(text, people),
          })
        : composing === null
          ? Promise.resolve(false)
          : post({
              boardId: runtime.boardId,
              body: text,
              at: { x: composing.x, y: composing.y },
              objectId: composing.objectId,
              /*
               * Both coordinates go: the fraction is how the pin rides its
               * element, and `at` is where it falls back to once that element
               * is deleted. A fraction of something that is gone is not a
               * position, and a comment outliving its element is a promise
               * this product already made.
               */
              ...(composing.on === null ? {} : { on: composing.on }),
              mentions: mentionsIn(text, people),
            })

    void write.then((ok) => {
      setBusy(false)
      if (!ok) {
        setProblem('That could not be saved. A board you are a member of takes comments.')
        return
      }
      setBody('')
      // Writing a thread is done with the composer; replying keeps you where
      // you are, reading what you just added to.
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
            // Typing a different name makes the last copy stale, and a button
            // still reading "Link copied" is a button claiming something it
            // did not do. Reset here rather than in an effect: this is the
            // event that invalidates it.
            setInvited(false)
          }}
        />

        {/*
          * A few names and a count, not the whole list.
          *
          * This was every name joined with commas, which was fine when the
          * only people offered were the board's own members. A workspace can
          * hold a great many, and a hint that turns into a paragraph is one
          * nobody reads — including the part that says what to type.
          */}
        {stranger === null && people.length > 1 && (
          <p className="of-comment-panel__hint" data-testid="comment-people-hint">
            Type @ and a name to notify someone:{' '}
            {people
              .slice(0, 4)
              .map((person) => person.displayName)
              .join(', ')}
            {people.length > 4 && ` and ${String(people.length - 4)} more`}
          </p>
        )}

        {/*
          * A name typed at somebody who is not here.
          *
          * The way onto a board is its link — that is how sharing already
          * works, and it is why there is no directory to search: a lookup
          * across every account would let anybody with a board enumerate the
          * whole user list, which no amount of row-level security undoes once
          * the function exists.
          *
          * So this offers the link rather than the person. It replaces the
          * hint rather than joining it: two lines about mentions, one of them
          * saying the thing you just typed will not work, is a paragraph
          * nobody reads.
          */}
        {stranger !== null && (
          <p className="of-comment-panel__hint" data-testid="comment-stranger">
            Nobody here is called {stranger}. Share the board with them and they can be
            mentioned.{' '}
            <button
              type="button"
              className="of-button of-button--ghost of-comment-panel__invite"
              data-testid="comment-invite"
              onClick={() => {
                copyInvite()
              }}
            >
              {invited ? 'Link copied' : 'Copy invite link'}
            </button>
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
                void resolve(thread.id, thread.resolvedAt === null).then((ok) => {
                  setBusy(false)
                  if (!ok) {
                    setProblem('That could not be changed.')
                    return
                  }
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
