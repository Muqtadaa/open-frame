import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import { accessKey, shareLink } from '../app/collab-config.js'

import { useDiscussion } from '../app/comments-context.js'
import {
  activeMentionQuery,
  allThreads,
  openThreads,
  insertMention,
  mentionsIn,
  peopleMatching,
  plainMentionText,
  tokeniseMentions,
  repliesTo,
  unknownMentionIn,
  type BoardComment,
  type BoardPerson,
} from '../hooks/use-comments.js'
import { useIdentity } from '../hooks/use-identity.js'
import { draftKey, useCommentDrafts } from '../interaction/comment-drafts.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { hueVar } from '../scene/presence.js'
import { Ago } from './Ago.js'
import { MentionPicker } from './MentionPicker.js'
import { MentionText } from './MentionText.js'

/**
 * Reading and writing one conversation.
 *
 * A panel rather than something drawn on the canvas: a thread is text of
 * arbitrary length, and text that scales with the board is text you cannot
 * read at 25%. The pin is on the board because that is WHERE the remark is
 * about; the words are in the margin because that is where words are legible.
 */
export function CommentPanel() {
  const { comments, people, replyCounts, post, resolve, focusComment } = useDiscussion()
  const { runtime } = useOpenFrame()
  const composing = useInteractionStore((state) => state.composing)
  const openThreadId = useInteractionStore((state) => state.openThreadId)
  const startComment = useInteractionStore((state) => state.startComment)
  const openThread = useInteractionStore((state) => state.openThread)
  const commentsOpen = useInteractionStore((state) => state.commentsOpen)
  const setCommentsOpen = useInteractionStore((state) => state.setCommentsOpen)

  const thread = useMemo(
    () => comments.find((comment) => comment.id === openThreadId) ?? null,
    [comments, openThreadId],
  )
  const replies = useMemo(
    () => (thread === null ? [] : repliesTo(comments, thread.id)),
    [comments, thread],
  )

  /*
   * The draft for what this panel writes into, if one was left unposted. Read
   * once, when the panel mounts — the panel is keyed on the same thing.
   */
  const key = draftKey(openThreadId, composing)
  const keepDraft = useCommentDrafts((state) => state.keep)
  const dropDraft = useCommentDrafts((state) => state.drop)
  const [kept] = useState(() =>
    key === null ? undefined : useCommentDrafts.getState().drafts.get(key),
  )
  const [body, setBody] = useState(kept?.body ?? '')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [invited, setInvited] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const me = useIdentity()

  /*
   * Where the caret is, tracked rather than read during render.
   *
   * The menu has to know which `@` the caret is inside, and that is not
   * derivable from the text: the same body has a different answer depending on
   * where you are standing in it. React does not re-render on a cursor move,
   * so every event that can move one reports it.
   */
  const [caret, setCaret] = useState(0)
  const [highlight, setHighlight] = useState(0)
  /*
   * Escape shuts the menu WITHOUT shutting the panel, so it has to be
   * remembered — the query is still under the caret and would otherwise
   * reopen on the next render. Cleared by moving to a different mention, since
   * dismissing one is not a decision about the next.
   */
  const [dismissed, setDismissed] = useState<number | null>(null)
  /*
   * Who was chosen from the menu, in the order they were chosen.
   *
   * The composer holds names, so this is what turns them back into ids on the
   * way out. Kept as a plain list rather than as positions in the text: a
   * range would have to be nudged along by every keystroke either side of it,
   * and getting that wrong sends a notification to the wrong person, whereas
   * a stale entry here simply finds no name to replace.
   */
  const [picked, setPicked] = useState<readonly BoardPerson[]>(kept?.picked ?? [])

  // Every change is kept, so no way out of the panel can lose it.
  useEffect(() => {
    if (key === null) return
    keepDraft(key, { body, picked, at: openThreadId === null ? composing : null })
  }, [key, body, picked, openThreadId, composing, keepDraft])
  /*
   * Resolving used to be indistinguishable from deleting: the pin came off
   * the board and the entry left the list, and there was nowhere left to read
   * what had been agreed. Off by default all the same — the reason a finished
   * discussion stops being shown is that a board which keeps every one of
   * them accumulates until nobody reads any.
   */
  const [showResolved, setShowResolved] = useState(false)
  /*
   * A mention that has just been chosen is SETTLED, and the menu shuts.
   *
   * It did not have to be said while a pick wrote a token, because a token
   * contains a bracket and `activeMentionQuery` refuses one. A name does not:
   * "@Rowan " is a perfectly good query that matches Rowan, so picking him
   * re-opened the menu underneath the name it had just written.
   *
   * Cleared by the next keystroke rather than by position, so backspacing
   * into the name you just chose offers the menu again — which is what you
   * are doing it for.
   */
  const [settled, setSettled] = useState(false)

  const query = useMemo(() => activeMentionQuery(body, caret), [body, caret])
  const candidates = useMemo(
    () => (query === null ? [] : peopleMatching(query.query, people)),
    [query, people],
  )
  const picking =
    query !== null && candidates.length > 0 && dismissed !== query.start && !settled

  const say = (next: string, at: number): void => {
    setBody(next)
    setCaret(at)
    setHighlight(0)
    setSettled(false)
    // Typing a different name makes the last copy stale, and a button still
    // reading "Link copied" is a button claiming something it did not do.
    setInvited(false)
  }

  const choose = (person: BoardPerson): void => {
    const next = insertMention(body, caret, person, people)
    setPicked((current) =>
      // By id, not by reference: the board's people are re-read on focus and
      // after every write, so the same person arrives as a new object and a
      // reference check would grow this list without bound.
      current.some((who) => who.userId === person.userId) ? current : [...current, person],
    )
    say(next.text, next.caret)
    // AFTER `say`, which clears it: choosing is itself a text change, and it
    // is the one text change that must not re-offer the menu.
    setSettled(true)
    const field = input.current
    if (field === null) return
    // The value lands on the next render, so the caret is placed after it.
    // Setting it now would position it inside the text that is still there.
    queueMicrotask(() => {
      field.focus()
      field.setSelectionRange(next.caret, next.caret)
    })
  }

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

  const heading = useRef<HTMLHeadingElement>(null)

  // A composer that opens without focus is a composer you have to click twice.
  useEffect(() => {
    if (composing !== null || thread !== null) input.current?.focus()
  }, [composing, thread])

  /*
   * The list, arrived at because what had the keyboard went away — a comment
   * just posted, a thread resolved — takes the keyboard at its heading rather
   * than leaving it on the page's body.
   */
  useEffect(() => {
    if (composing !== null || thread !== null) return
    if (document.activeElement === null || document.activeElement === document.body) {
      heading.current?.focus()
    }
  }, [composing, thread])

  /*
   * Open with nothing chosen yet: the panel lists what is already on the
   * board, which is what somebody who has just picked the comment tool wants
   * to see. Without this the tool did nothing visible until you clicked the
   * canvas, so there was no way to tell it was active.
   */
  const browsing = composing === null && thread === null
  if (browsing && !commentsOpen) return null

  const close = (): void => {
    startComment(null)
    openThread(null)
    // Closing is a decision that sticks until the tool is chosen again.
    setCommentsOpen(false)
  }

  const live = openThreads(comments)
  const threads = showResolved ? allThreads(comments) : live
  const resolvedCount = allThreads(comments).length - live.length

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
    // Names become ids here, at the one point the comment leaves the browser.
    const text = tokeniseMentions(body, picked, people).trim()
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
      if (key !== null) dropDraft(key)
      setBody('')
      setCaret(0)
      // A fresh composer has chosen nobody. Carrying these into the next
      // comment would tokenise a name that this one never picked.
      setPicked([])
      // Writing a thread is done with the composer; replying keeps you where
      // you are, reading what you just added to.
      if (thread === null) startComment(null)
    })
  }

  const attachedTo = thread?.objectId ?? composing?.objectId ?? null
  const attachmentGone =
    attachedTo !== null && !runtime.store.getDocument().objects.has(attachedTo)

  return (
    <aside
      className="of-comment-panel"
      aria-label="Comments"
      data-testid="comment-panel"
      /*
       * Escape closes the panel from anywhere in it — the heading, a list
       * entry, Resolve — not only from the text box. Stopped here: the
       * board's keymap reads Escape as "clear the selection".
       */
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        event.preventDefault()
        event.stopPropagation()
        close()
      }}
    >
      <header className="of-comment-panel__head">
        <h2 className="of-comment-panel__title" ref={heading} tabIndex={-1}>
          {browsing ? 'Comments' : thread === null ? 'New comment' : 'Comment'}
        </h2>
        <button
          type="button"
          className="of-button of-button--ghost"
          data-testid="comment-close"
          onClick={close}
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

      {/*
        * BROWSING: what is already on the board, so picking the comment tool
        * shows you the conversation rather than an empty panel waiting for a
        * click. Clicking one opens it, which is the same thing its pin does.
        */}
      {browsing && (
        <div className="of-comment-panel__list" data-testid="comment-list">
          {threads.length === 0 ? (
            <p className="of-comment-panel__hint" data-testid="comment-list-empty">
              {resolvedCount === 0
                ? 'Nothing has been said on this board yet. Click anywhere to start.'
                : 'Everything here has been resolved.'}
            </p>
          ) : (
            threads.map((open) => (
              <button
                key={open.id}
                type="button"
                className={
                  open.resolvedAt === null
                    ? 'of-comment-panel__entry'
                    : 'of-comment-panel__entry is-resolved'
                }
                data-testid={`comment-entry-${open.id}`}
                data-resolved={open.resolvedAt === null ? 'false' : 'true'}
                /*
                 * Through the same "take me to this comment" a mention uses,
                 * so a thread whose pin is off screen is brought into view as
                 * it opens. It opened in place, and where the discussion WAS
                 * stayed somewhere you had to go looking.
                 */
                onClick={() => {
                  if (!focusComment(open.id)) openThread(open.id)
                }}
              >
                <span className="of-comment-panel__byline">
                  <span className="of-comment-panel__who">{open.authorName}</span>
                  <Ago at={open.createdAt} />
                  {(replyCounts.get(open.id) ?? 0) > 0 && (
                    <span className="of-comment-panel__replies">
                      {(replyCounts.get(open.id) ?? 0) === 1
                        ? '1 reply'
                        : `${String(replyCounts.get(open.id) ?? 0)} replies`}
                    </span>
                  )}
                </span>
                <span className="of-comment-panel__said">
                  {plainMentionText(open.body).slice(0, 90)}
                </span>
              </button>
            ))
          )}

          {/*
            * Offered only when there IS one. A control that reveals nothing
            * is a control people press once and learn to distrust, and the
            * count is what makes pressing it worth it.
            */}
          {resolvedCount > 0 && (
            <button
              type="button"
              className="of-button of-button--ghost of-comment-panel__resolved-toggle"
              aria-pressed={showResolved}
              data-testid="comment-show-resolved"
              onClick={() => {
                setShowResolved((was) => !was)
              }}
            >
              {showResolved
                ? 'Hide resolved'
                : `Show ${String(resolvedCount)} resolved`}
            </button>
          )}
        </div>
      )}

      {thread !== null && (
        <div className="of-comment-panel__thread">
          <Remark comment={thread} whoIsMe={me?.userId ?? null} />
          {replies.map((reply) => (
            <Remark key={reply.id} comment={reply} whoIsMe={me?.userId ?? null} />
          ))}
        </div>
      )}

      {/*
        * No composer while browsing: a comment is dropped somewhere, so there
        * is nothing to write INTO until a spot or a thread is chosen. A box
        * that posted to nowhere would be the worst of the three states.
        */}
      {!browsing && (
      <form onSubmit={submit}>
        <textarea
          ref={input}
          className="of-input"
          rows={3}
          value={body}
          maxLength={4000}
          disabled={busy}
          placeholder={thread === null ? 'Say something' : 'Reply'}
          aria-label={thread === null ? 'Your comment' : 'Your reply'}
          data-testid="comment-input"
          role="combobox"
          aria-expanded={picking}
          aria-controls="of-mention-menu"
          aria-autocomplete="list"
          aria-activedescendant={
            picking ? `of-mention-menu-${String(highlight)}` : undefined
          }
          onChange={(event) => {
            say(event.target.value, event.target.selectionStart)
          }}
          // Every way a caret moves without the text changing.
          onSelect={(event) => {
            setCaret(event.currentTarget.selectionStart)
          }}
          onKeyDown={(event) => {
            /*
             * The menu takes the keys it needs and passes on the rest, so the
             * composer behaves exactly as it did whenever nothing is open.
             * Checked FIRST because every one of these keys already means
             * something here — Enter is a newline, Escape closes the panel.
             */
            if (picking) {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                const step = event.key === 'ArrowDown' ? 1 : -1
                // Wraps, because a menu of three that stops at the bottom
                // makes you travel back up through all of them.
                setHighlight(
                  (current) =>
                    (current + step + candidates.length) % candidates.length,
                )
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setDismissed(query.start)
                return
              }
              /*
               * Tab and plain Enter choose. Enter with a modifier does NOT:
               * Cmd+Enter posts, and somebody who has finished typing a name
               * and wants to send it should not have to dismiss a menu first.
               */
              if (
                event.key === 'Tab' ||
                (event.key === 'Enter' && !event.metaKey && !event.ctrlKey)
              ) {
                const person = candidates[highlight]
                if (person !== undefined) {
                  event.preventDefault()
                  choose(person)
                  return
                }
              }
            }
            /*
             * Cmd or Ctrl + Enter posts; Escape closes without posting.
             *
             * Plain Enter is a new LINE here, unlike a table cell — a comment
             * is prose and often several sentences, and a composer that
             * submitted on Enter would cut people off mid-thought. That is
             * why the commit takes a modifier and the table's does not.
             */
            if (event.key === 'Escape') {
              event.preventDefault()
              /*
               * Escape closes the panel, panel and all, and KEEPS the words:
               * the draft is held outside the panel and comes back when this
               * spot or thread is opened again. It used to throw them away —
               * the one failure this product does not accept, from the key
               * that means "done" everywhere else on the board.
               */
              close()
              return
            }
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              submit(event)
            }
          }}
        />

        {picking && (
          <MentionPicker
            id="of-mention-menu"
            people={candidates}
            highlight={highlight}
            onPick={choose}
          />
        )}

        {/*
          * A few names and a count, not the whole list.
          *
          * This was every name joined with commas, which was fine when the
          * only people offered were the board's own members. A workspace can
          * hold a great many, and a hint that turns into a paragraph is one
          * nobody reads — including the part that says what to type.
          */}
        {!picking && stranger === null && people.length > 1 && (
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
        {!picking && stranger !== null && (
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

        {kept?.body === body && (
          <p className="of-comment-panel__hint" data-testid="comment-draft-kept">
            Draft kept from before.
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
      )}
    </aside>
  )
}

function Remark({
  comment,
  whoIsMe,
}: {
  readonly comment: BoardComment
  readonly whoIsMe: string | null
}) {
  return (
    <article className="of-comment">
      <span className="of-comment__who" style={{ background: hueVar(comment.authorHue) }}>
        {(comment.authorName.trim()[0] ?? '?').toUpperCase()}
      </span>
      <div className="of-comment__body">
        <span className="of-comment__byline">
          <span className="of-comment__name">{comment.authorName}</span>
          <Ago at={comment.createdAt} />
        </span>
        <p className="of-comment__text">
          <MentionText body={comment.body} whoIsMe={whoIsMe} />
        </p>
      </div>
    </article>
  )
}
