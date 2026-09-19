import { useEffect, useState, type FormEvent } from 'react'

import { unlockBoard } from '../app/board-password.js'
import { readRoute } from '../app/route.js'
import { useOpenFrame } from '../runtime/context.js'

/**
 * The password prompt, for a board whose link is not enough on its own.
 *
 * The room closes with 4003 rather than sending any of the board, so there is
 * nothing underneath this to look at — which is why it covers everything and
 * cannot be dismissed, exactly like `BoardGone`. The difference is that this
 * one is recoverable: somebody types the password and the board opens.
 *
 * REOPENED BY RELOADING rather than by reconnecting in place. The provider has
 * stopped for good by the time this is on screen, and the board, the document
 * and the CRDT were all built for a connection that was refused — restarting
 * the page is both simpler and more honest than persuading a dead object graph
 * that it is alive again.
 */
export function BoardLocked() {
  const { runtime, collaboration } = useOpenFrame()
  const [locked, setLocked] = useState(collaboration?.status === 'locked')
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [trying, setTrying] = useState(false)

  useEffect(() => {
    if (collaboration === null || collaboration === undefined) return
    return collaboration.onStatus((status) => {
      if (status === 'locked') setLocked(true)
    })
  }, [collaboration])

  if (!locked) return null

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (trying) return
    setTrying(true)
    setProblem(null)

    // The link this browser arrived on. The room checks it BEFORE the
    // password, so somebody without it learns nothing about whether a board is
    // protected — and an unlock without it would be refused for that reason
    // rather than for the password being wrong.
    const route = readRoute(window.location.search)
    const key = route.kind === 'board' ? route.key : null

    void unlockBoard(runtime.boardId, key, password).then(
      (outcome) => {
        if (outcome.ok) {
          window.location.reload()
          return
        }
        setTrying(false)
        setPassword('')
        setProblem(outcome.reason)
      },
    )
  }

  return (
    <div className="of-gone" role="alertdialog" aria-modal="true" data-testid="board-locked">
      <form className="of-gone__panel" onSubmit={submit}>
        <h2 className="of-gone__title">This board has a password</h2>
        <p className="of-gone__body">
          The link is not enough on its own. Ask whoever sent it for the password.
        </p>

        <label className="of-visually-hidden" htmlFor="of-board-password">
          Password
        </label>
        <input
          id="of-board-password"
          className="of-input of-gone__input"
          type="password"
          autoComplete="off"
          autoFocus
          value={password}
          disabled={trying}
          onChange={(event) => {
            setPassword(event.target.value)
          }}
          data-testid="board-password"
        />

        {problem !== null && (
          <p className="of-gone__problem" role="alert" data-testid="board-password-problem">
            {problem}
          </p>
        )}

        <button
          type="submit"
          className="of-button of-button--primary of-gone__submit"
          disabled={trying || password.length === 0}
          data-testid="board-unlock"
        >
          {trying ? 'Opening…' : 'Open the board'}
        </button>
      </form>
    </div>
  )
}
