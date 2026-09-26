import { useEffect, useRef, useState } from 'react'

import { keepCopy } from '../app/boards.js'
import { boardHref } from '../app/route.js'
import { useOpenFrame } from '../runtime/context.js'
import { Gate, GateActions, GateBody } from './Gate.js'

/**
 * What a member sees when the owner deletes the board under them.
 *
 * The room puts everyone out with 4004 and then refuses every reconnection
 * with 410. Before this existed the provider treated that like any dropped
 * connection: it reconnected, was refused, backed off and tried again, for as
 * long as the tab stayed open — and the board simply stopped responding, with
 * nothing anywhere saying why. A frozen board that blames nobody reads as a
 * bug in OpenFrame, which is the wrong thing to have just taught the user.
 *
 * NOT DISMISSIBLE, and that is the difference between this and `NoticeBanner`.
 * A notice you can wave away is right for a board that opened degraded and is
 * still usable. This board is gone: everything on screen is a corpse, nothing
 * typed into it can be saved anywhere, and offering to hide the message would
 * be offering to go on working into a void. The only honest thing left to do
 * is leave, so that is the only control.
 */
export function BoardGone() {
  const { runtime, collaboration } = useOpenFrame()
  // Read once at mount as well as subscribed: the room can have put us out
  // before this ever rendered, and a subscription only reports what happens
  // NEXT.
  const [gone, setGone] = useState(collaboration?.status === 'gone')
  const keep = useRef<HTMLButtonElement>(null)
  const [keeping, setKeeping] = useState(false)
  const [keepFailed, setKeepFailed] = useState(false)

  useEffect(() => {
    if (collaboration === null || collaboration === undefined) return
    return collaboration.onStatus((status) => {
      // One way only. `gone` is terminal, and nothing that arrives afterwards
      // can put the board back.
      if (status === 'gone') setGone(true)
    })
  }, [collaboration])

  if (!gone) return null

  /*
   * What is on screen is the last copy anybody has. The store still holds it
   * — `dispose` only detached autosave from it — so it is read from there, at
   * the moment of asking, and written under a new id of this browser's own.
   */
  const keepIt = (): void => {
    if (keeping) return
    setKeeping(true)
    setKeepFailed(false)
    keepCopy(runtime.repository, runtime.store.getDocument()).then(
      (id) => {
        window.location.assign(boardHref(id, false))
      },
      () => {
        setKeeping(false)
        setKeepFailed(true)
      },
    )
  }

  return (
    // Keeping takes the keyboard: it is the one thing here that saves anything.
    <Gate heading="This board was deleted" testId="board-gone" initialFocus={keep}>
      <GateBody>
        Whoever owns it removed it while you had it open. Nothing you change here can be saved to
        it, but you can keep what is on screen as a board of your own.
      </GateBody>
      {keepFailed && (
        <p className="of-gone__problem" role="alert">
          The copy could not be saved in this browser.
        </p>
      )}
      <GateActions>
        <button
          ref={keep}
          type="button"
          className="of-button of-button--primary"
          aria-busy={keeping}
          onClick={keepIt}
          data-testid="board-gone-keep"
        >
          {keeping ? 'Keeping…' : 'Keep a copy'}
        </button>
        <a className="of-button" href="/" data-testid="board-gone-exit">
          All boards
        </a>
      </GateActions>
    </Gate>
  )
}
