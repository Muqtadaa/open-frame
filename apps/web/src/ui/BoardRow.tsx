import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { BoardRepository } from '@openframe/core'

import { canDelete, canLeave, describeWhen, type ListedBoard } from '../app/boards.js'
import { setLocalPin } from '../app/board-prefs.js'
import { deleteBoardEverywhere, leaveBoard, renameBoard } from '../app/board-lifecycle.js'
import { shareLink } from '../app/collab-config.js'
import { setBoardPinned } from '../app/remote-boards.js'
import { boardHref } from '../app/route.js'
import { LeaveIcon, PinIcon, RenameIcon, TrashIcon } from './icons.js'

/**
 * One board, and the three things you can do to it without opening it.
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
type Mode = 'rest' | 'renaming' | 'confirming' | 'working'

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
  const input = useRef<HTMLInputElement>(null)

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
          className="of-home__pin"
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
            <button
              type="button"
              className="of-home__row-action"
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
                className="of-home__row-action"
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
                  className="of-home__row-action of-home__row-action--destructive"
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
      </div>

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
