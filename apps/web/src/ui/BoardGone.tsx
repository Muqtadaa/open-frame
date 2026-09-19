import { useEffect, useState } from 'react'

import { useOpenFrame } from '../runtime/context.js'

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
  const { collaboration } = useOpenFrame()
  // Read once at mount as well as subscribed: the room can have put us out
  // before this ever rendered, and a subscription only reports what happens
  // NEXT.
  const [gone, setGone] = useState(collaboration?.status === 'gone')

  useEffect(() => {
    if (collaboration === null || collaboration === undefined) return
    return collaboration.onStatus((status) => {
      // One way only. `gone` is terminal, and nothing that arrives afterwards
      // can put the board back.
      if (status === 'gone') setGone(true)
    })
  }, [collaboration])

  if (!gone) return null

  return (
    <div className="of-gone" role="alertdialog" aria-modal="true" data-testid="board-gone">
      <div className="of-gone__panel">
        <h2 className="of-gone__title">This board was deleted</h2>
        <p className="of-gone__body">
          Whoever owns it removed it while you had it open. Nothing you change here can be saved.
        </p>
        <a className="of-button of-button--primary" href="/" data-testid="board-gone-exit">
          All boards
        </a>
      </div>
    </div>
  )
}
