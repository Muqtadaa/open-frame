import { useState } from 'react'
import type { BoardRepository } from '@openframe/core'

import { claimLocalBoard } from '../app/share.js'
import type { ListedBoard } from '../app/boards.js'

/**
 * The boards that were here before you signed in.
 *
 * A board used to be able to belong to nobody, and any that were made that way
 * are still sitting in this browser — invisible from every other machine and
 * lost with the site data. Signing in is the first moment there is somewhere
 * for them to go.
 *
 * OFFERED, listed by name, and never taken silently. Uploading somebody's work
 * to a server without asking is not a migration, it is a surprise — and the
 * list is here so the offer names exactly what it is about to move rather than
 * saying "your boards" and hoping.
 */
export function ClaimLocalBoards({
  boards,
  repository,
  onChanged,
}: {
  readonly boards: readonly ListedBoard[]
  readonly repository: BoardRepository
  readonly onChanged: () => void
}) {
  const [moving, setMoving] = useState(false)
  const [failed, setFailed] = useState<readonly string[]>([])

  if (boards.length === 0) return null

  const move = (): void => {
    setMoving(true)
    setFailed([])

    void (async () => {
      const problems: string[] = []
      /*
       * One at a time, and a failure does not stop the rest. Each board is an
       * independent move — a room that refused to be claimed for one of them
       * is no reason to leave the other four behind.
       */
      for (const board of boards) {
        try {
          await claimLocalBoard(repository, board.boardId)
        } catch {
          problems.push(board.title)
        }
      }
      setMoving(false)
      setFailed(problems)
      onChanged()
    })()
  }

  return (
    <section className="of-home__claim" data-testid="claim-local" aria-labelledby="of-home-claim">
      <h2 className="of-home__heading" id="of-home-claim">
        boards in this browser
      </h2>
      <p className="of-home__note">
        {boards.length === 1 ? 'This board lives' : `These ${String(boards.length)} boards live`} in
        this browser only. Moving {boards.length === 1 ? 'it' : 'them'} to your account means{' '}
        {boards.length === 1 ? 'it follows' : 'they follow'} you to any machine you sign in on.
      </p>

      <ul className="of-home__claim-list">
        {boards.map((board) => (
          <li key={board.boardId}>{board.title}</li>
        ))}
      </ul>

      <button
        type="button"
        className="of-home__start"
        data-testid="claim-local-go"
        disabled={moving}
        onClick={move}
      >
        {moving ? 'Moving…' : `Move to my account`}
      </button>

      {failed.length > 0 && (
        <p className="of-home__row-problem" role="alert" data-testid="claim-local-failed">
          {failed.length === 1 ? 'This board' : 'These boards'} could not be moved and{' '}
          {failed.length === 1 ? 'is' : 'are'} still here: {failed.join(', ')}.
        </p>
      )}
    </section>
  )
}
