import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { recoverOwnerKey, unlockBoard } from '../app/board-password.js'
import { readRoute } from '../app/route.js'
import { useOpenFrame } from '../runtime/context.js'
import { Gate, GateActions, GateBody } from './Gate.js'

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
  /*
   * Nothing is shown until the owner question is settled.
   *
   * An owner opening a deep link on a machine that has never loaded their
   * board list holds no owner key, so the room asks them for the password on
   * their own board — the exact thing this is meant to prevent. Asking
   * Supabase once answers it, and the prompt must not flash up in the
   * meantime, because for an owner it is about to be replaced by the board.
   */
  const [asking, setAsking] = useState(false)
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [trying, setTrying] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const problemId = useId()

  useEffect(() => {
    if (collaboration === null || collaboration === undefined) return
    return collaboration.onStatus((status) => {
      if (status === 'locked') setLocked(true)
    })
  }, [collaboration])

  useEffect(() => {
    if (!locked) return
    let live = true
    void recoverOwnerKey(runtime.boardId).then((key) => {
      if (!live) return
      // Found one: this is the owner, and the board opens without a password.
      if (key !== null) window.location.reload()
      else setAsking(true)
    })
    return () => {
      live = false
    }
  }, [locked, runtime.boardId])

  if (!locked || !asking) return null

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

    void unlockBoard(runtime.boardId, key, password).then((outcome) => {
      if (outcome.ok) {
        window.location.reload()
        return
      }
      setTrying(false)
      setPassword('')
      setProblem(outcome.reason)
      // Back in the field, ready for the next try. It was DISABLED while
      // trying, which dropped the keyboard onto the page body.
      field.current?.focus()
    })
  }

  return (
    <Gate
      heading="This board has a password"
      testId="board-locked"
      as="form"
      onSubmit={submit}
      initialFocus={field}
    >
      <GateBody>The link is not enough on its own. Ask whoever sent it for the password.</GateBody>

      <label className="of-visually-hidden" htmlFor="of-board-password">
        Password
      </label>
      {/*
        Never disabled while the password is checked: a disabled field loses
        the keyboard, and there is nowhere sensible for it to go. A second
        press is refused by `trying` instead.
      */}
      <input
        ref={field}
        id="of-board-password"
        className="of-input of-input--large of-gone__input"
        type="password"
        autoComplete="off"
        value={password}
        readOnly={trying}
        aria-invalid={problem !== null}
        aria-describedby={problem !== null ? problemId : undefined}
        onChange={(event) => {
          setPassword(event.target.value)
          setProblem(null)
        }}
        data-testid="board-password"
      />

      {problem !== null && (
        <p
          id={problemId}
          className="of-gone__problem"
          role="alert"
          data-testid="board-password-problem"
        >
          {problem}
        </p>
      )}

      <button
        type="submit"
        className="of-button of-button--primary of-button--large of-gone__submit"
        disabled={password.length === 0}
        aria-busy={trying}
        data-testid="board-unlock"
      >
        {trying ? 'Opening…' : 'Open the board'}
      </button>
      <GateActions>
        <a className="of-button of-button--ghost" href="/" data-testid="board-locked-exit">
          All boards
        </a>
      </GateActions>
    </Gate>
  )
}
