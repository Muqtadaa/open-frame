import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { BoardRepository } from '@openframe/core'

import { canDelete, canLeave, describeWhen, type ListedBoard } from '../app/boards.js'
import { setLocalPin } from '../app/board-prefs.js'
import { deleteBoardEverywhere, leaveBoard, renameBoard } from '../app/board-lifecycle.js'
import { shareLink } from '../app/collab-config.js'
import { setBoardPassword } from '../app/board-password.js'
import { setBoardPinned } from '../app/remote-boards.js'
import { boardHref } from '../app/route.js'
import { KeyIcon, LeaveIcon, LinkIcon, PinIcon, RenameIcon, TrashIcon } from '../controls/icons.js'

/**
 * One board, and the things you can do to it without opening it.
 *
 * The row is a LINK with controls beside it, not a link wrapped around them: a
 * button inside an anchor is invalid, and the browsers that tolerate it
 * disagree about which one a click belongs to. So the anchor covers the part
 * that means "open this" and nothing else.
 *
 * Destroying is confirmed IN THE ROW rather than in a dialog. The craft floor
 * bans a modal for anything that needs neither protected focus nor
 * interruption, and a confirmation that appears where the thing being
 * destroyed is named is a better confirmation anyway — nobody has to remember
 * which board the dialog is about.
 */
type Mode = 'rest' | 'renaming' | 'confirming' | 'working' | 'password'

export function BoardRow({
  board,
  index,
  readAt,
  repository,
  onChanged,
}: {
  readonly board: ListedBoard
  readonly index: number
  readonly readAt: number
  readonly repository: BoardRepository
  readonly onChanged: () => void
}) {
  const [mode, setMode] = useState<Mode>('rest')
  const [draft, setDraft] = useState(board.title)
  const [pinned, setPinned] = useState(board.pinned)
  const [problem, setProblem] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [secret, setSecret] = useState('')
  const input = useRef<HTMLInputElement>(null)

  // The copied note clears itself. A bare `setTimeout` in the handler outlives
  // the row when the list re-renders under it.
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  useEffect(() => {
    if (mode === 'renaming') input.current?.select()
  }, [mode])

  const href = board.shared
    ? // The key travels with the link: a claimed room refuses the board id.
      shareLink(board.boardId, '', board.accessKey)
    : boardHref(board.boardId, false)

  const togglePin = (): void => {
    const next = !pinned
    // Moved on screen first, then recorded. This is a preference about an
    // ordering, and making somebody wait for a round trip to see a pin go in
    // is the wrong trade; if the write fails the list is re-read anyway.
    setPinned(next)
    if (board.shared) void setBoardPinned(board.boardId, next).then(onChanged)
    else {
      setLocalPin(board.boardId, next)
      onChanged()
    }
  }

  const commitRename = (): void => {
    const trimmed = draft.trim()
    setMode('rest')
    if (trimmed === board.title || trimmed.length === 0) {
      setDraft(board.title)
      return
    }
    void renameBoard(repository, board, trimmed).then((ok) => {
      if (!ok) {
        setDraft(board.title)
        setProblem('That name could not be saved.')
        return
      }
      onChanged()
    })
  }

  /**
   * Sets or clears the password, then returns the row to rest.
   *
   * The OWNER key is the authority the room checks. A board claimed before
   * owner keys existed has none, and adopts one on its edit key — which is
   * what `accessKey` is for a board you own, and the strongest thing such a
   * board has.
   */
  const applyPassword = async (next: string | null): Promise<void> => {
    if (board.accessKey === null) {
      setProblem('This board has no link to protect.')
      return
    }
    const outcome = await setBoardPassword(
      board.boardId,
      { owner: board.ownerKey, editor: board.accessKey },
      next,
    )
    if (!outcome.ok) {
      setProblem(outcome.reason)
      return
    }
    setProblem(null)
    setSecret('')
    setMode('rest')
  }

  const remove = (): void => {
    setMode('working')
    setProblem(null)
    const done = canLeave(board)
      ? leaveBoard(repository, board.boardId)
      : deleteBoardEverywhere(repository, board)

    void done.then((outcome) => {
      if (outcome.ok) {
        onChanged()
        return
      }
      setMode('rest')
      setProblem(outcome.reason)
    })
  }

  return (
    <li
      className="of-home__row"
      /* Capped: an eleventh row arriving eleven beats late is a list that
         feels slow, which is the opposite of the point. */
      style={{ '--of-row': Math.min(index, 5) } as CSSProperties}
      data-pinned={pinned ? 'yes' : 'no'}
    >
      <div className="of-home__row-main">
        <button
          type="button"
          className="of-icon-button of-home__pin"
          aria-pressed={pinned}
          data-testid="pin-board"
          title={pinned ? 'Unpin this board' : 'Pin this board to the top'}
          onClick={togglePin}
        >
          <PinIcon pressed={pinned} />
          <span className="of-visually-hidden">{pinned ? 'Unpin' : 'Pin'} {board.title}</span>
        </button>

        {mode === 'renaming' ? (
          <input
            ref={input}
            className="of-home__rename"
            data-testid="rename-input"
            aria-label={`Rename ${board.title}`}
            value={draft}
            maxLength={200}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitRename()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setDraft(board.title)
                setMode('rest')
              }
            }}
          />
        ) : (
          <a className="of-home__board" href={href} data-testid="board-link">
            <span className="of-home__board-title">{board.title}</span>
            {/*
              * What this board IS, in the column the ledger keeps for it.
              *
              * A local board is tagged too, which is what let the claim offer
              * below shrink to one line: the rows say which ones they are, so
              * the offer does not have to list them a second time.
              */}
            <span className="of-home__board-tag" data-kind={board.shared ? 'shared' : 'local'}>
              {!board.shared
                ? 'this browser'
                : board.role === 'viewer'
                  ? 'view only'
                  : board.role === 'owner'
                    ? 'shared'
                    : 'shared with you'}
            </span>
            <span className="of-home__board-when">{describeWhen(board.updatedAt, readAt)}</span>
          </a>
        )}

        {mode === 'rest' && (
          <span className="of-home__row-actions">
            {/*
              * The VIEW-ONLY link, for a board you own.
              *
              * Both links used to be visible exactly once — in the panel that
              * appears the moment a board is shared — and the weaker one was
              * unrecoverable after that, so the only link you could ever send
              * again was the one that lets people change the board. The edit
              * link is not offered here because it is the link you are already
              * holding: opening the board gives it to you.
              */}
            {board.viewKey !== null && (
              <button
                type="button"
                className="of-icon-button"
                data-testid="copy-view-link"
                title={`Copy a view-only link to ${board.title}. They can open it, not change it.`}
                onClick={() => {
                  const link = shareLink(board.boardId, window.location.origin, board.viewKey)
                  void navigator.clipboard.writeText(link).then(
                    () => {
                      setProblem(null)
                      setCopied(true)
                    },
                    // A denied clipboard is silent otherwise: the note never
                    // appears and the row looks like it ignored the click.
                    () => {
                      setProblem('Could not copy the link.')
                    },
                  )
                }}
              >
                <LinkIcon />
                <span className="of-visually-hidden">
                  Copy a view-only link to {board.title}
                </span>
              </button>
            )}

            {/*
              * A PASSWORD on the links, for a board you own.
              *
              * Gated on the same signal as the view-only link — a board whose
              * second key came back is one you own — because the room takes
              * the EDITOR key for this, and that is the key an owner holds.
              */}
            {board.viewKey !== null && (
              <button
                type="button"
                className="of-icon-button"
                data-testid="set-password"
                title={`Require a password for ${board.title}. Both links ask for it.`}
                onClick={() => {
                  setSecret('')
                  setProblem(null)
                  setMode('password')
                }}
              >
                <KeyIcon />
                <span className="of-visually-hidden">Require a password for {board.title}</span>
              </button>
            )}

            <button
              type="button"
              className="of-icon-button"
              data-testid="rename-board"
              title={`Rename ${board.title}`}
              onClick={() => {
                setDraft(board.title)
                setMode('renaming')
              }}
            >
              <RenameIcon />
              <span className="of-visually-hidden">Rename {board.title}</span>
            </button>

            {/*
              * One control or the other, never both and never a shared one.
              * Deleting removes the board from everybody; leaving removes you
              * from a board that carries on without you. A single "remove"
              * would eventually destroy somebody's work on behalf of a person
              * tidying their own list.
              */}
            {canLeave(board) ? (
              <button
                type="button"
                className="of-icon-button"
                data-testid="leave-board"
                title={`Leave ${board.title}. It carries on without you.`}
                onClick={() => setMode('confirming')}
              >
                <LeaveIcon />
                <span className="of-visually-hidden">Leave {board.title}</span>
              </button>
            ) : (
              canDelete(board) && (
                <button
                  type="button"
                  className="of-icon-button of-icon-button--destructive"
                  data-testid="delete-board"
                  title={`Delete ${board.title}. This cannot be undone.`}
                  onClick={() => setMode('confirming')}
                >
                  <TrashIcon />
                  <span className="of-visually-hidden">Delete {board.title}</span>
                </button>
              )
            )}
          </span>
        )}

        {mode === 'working' && <span className="of-home__row-note">Removing…</span>}
        {copied && (
          <span className="of-home__row-note" role="status">
            View-only link copied
          </span>
        )}
      </div>

      {mode === 'password' && (
        <form
          className="of-home__confirm"
          data-testid="password-form"
          onSubmit={(event) => {
            event.preventDefault()
            void applyPassword(secret)
          }}
        >
          <span className="of-home__confirm-what">
            Both links will ask for this. Anyone who has already opened the board is signed out
            of it.
          </span>
          <input
            className="of-input of-home__password"
            type="password"
            autoComplete="off"
            aria-label={`A password for ${board.title}`}
            data-testid="password-input"
            value={secret}
            onChange={(event) => {
              setSecret(event.target.value)
            }}
          />
          <button type="submit" className="of-home__confirm-yes" data-testid="password-save">
            Set
          </button>
          {/*
            * Clearing is the same authority and the same request with a null
            * body, so it lives here rather than behind a second control that
            * would have to be enabled by state this row does not have.
            */}
          <button
            type="button"
            className="of-home__confirm-no"
            data-testid="password-clear"
            onClick={() => {
              void applyPassword(null)
            }}
          >
            No password
          </button>
        </form>
      )}

      {mode === 'confirming' && (
        <p className="of-home__confirm" data-testid="confirm-remove" role="alert">
          <span className="of-home__confirm-what">
            {canLeave(board)
              ? 'Leave this board? It carries on without you.'
              : 'Delete this board for everyone? Its links stop working and this cannot be undone.'}
          </span>
          <button
            type="button"
            className="of-home__confirm-yes"
            data-testid="confirm-yes"
            onClick={remove}
          >
            {canLeave(board) ? 'Leave' : 'Delete'}
          </button>
          <button
            type="button"
            className="of-home__confirm-no"
            data-testid="confirm-no"
            onClick={() => setMode('rest')}
          >
            Keep
          </button>
        </p>
      )}

      {problem !== null && (
        <p className="of-home__row-problem" role="alert" data-testid="row-problem">
          {problem}
        </p>
      )}
    </li>
  )
}
