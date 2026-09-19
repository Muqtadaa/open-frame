import { useState } from 'react'
import type { BoardRepository } from '@openframe/core'

import { claimLocalBoard } from '../app/share.js'
import type { ListedBoard } from '../app/boards.js'

/**
 * The offer to move boards that live only in this browser.
 *
 * ONE LINE, because the boards are already listed three inches above it. The
 * first version of this had a heading, two sentences and a bulleted list of
 * every board — which meant the same five rows appeared twice on one screen,
 * under two different names for the same thing. The rows carry a `this browser`
 * tag now, so this says only what the tag cannot: what happens if you press it.
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
       * independent move — one that could not be written is no reason to leave
       * the other four behind.
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

  const count = boards.length

  return (
    <div className="of-home__claim" data-testid="claim-local">
      <p className="of-home__claim-what">
        {count === 1 ? 'One board here is' : `${String(count)} boards here are`} only in this
        browser.
      </p>
      <button
        type="button"
        className="of-home__claim-go"
        data-testid="claim-local-go"
        disabled={moving}
        onClick={move}
      >
        {moving ? 'Moving…' : 'Move to my account'}
      </button>

      {failed.length > 0 && (
        <p className="of-home__claim-problem" role="alert" data-testid="claim-local-failed">
          Still here: {failed.join(', ')}.
        </p>
      )}
    </div>
  )
}
