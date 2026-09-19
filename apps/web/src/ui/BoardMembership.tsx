import { useEffect, useState } from 'react'

import { accessKey } from '../app/collab-config.js'
import { ACCOUNTS_ENABLED } from '../app/identity.js'
import { joinBoard, listMyBoards } from '../app/remote-boards.js'
import { useIdentity } from '../hooks/use-identity.js'
import { useOpenFrame } from '../runtime/context.js'

/**
 * Keeping a board somebody shared with you.
 *
 * Opening a link made you a guest in the ROOM and nothing in the DATABASE, so
 * the board never reached your list — you could work on it all afternoon and
 * then have no way back to it but the original message. That was not an
 * oversight in the interface: `board_members` allows only a board's owner to
 * add members, so there was no row anybody could have written.
 *
 * Offered rather than taken. Every link you have ever clicked accumulating in
 * your board list is its own kind of mess, and "which boards are mine" is a
 * question the person should answer, not the router.
 */
type State = 'checking' | 'offer' | 'joining' | 'kept' | 'hidden'

export function BoardMembership() {
  const { runtime, collaboration } = useOpenFrame()
  const identity = useIdentity()
  const [state, setState] = useState<State>('checking')

  const key = typeof window === 'undefined' ? null : accessKey(window.location.search)
  const inRoom = collaboration !== null && collaboration !== undefined
  /*
   * DERIVED, and the early return below is what acts on it — not a state the
   * effect writes. A `setState` in an effect body to record something already
   * known at render time is a second copy of the truth and an extra pass, and
   * the lint rule that says so is right.
   */
  const eligible = ACCOUNTS_ENABLED && inRoom && identity !== null && key !== null

  useEffect(() => {
    if (!eligible) return

    let live = true
    /*
     * Asked once, on arrival. The alternative — showing the offer always and
     * letting the join be idempotent — puts a control in front of somebody for
     * a board that is already theirs, which reads as the interface not knowing
     * what it has.
     */
    void listMyBoards().then((boards) => {
      if (!live) return
      const already = boards.some((board) => board.boardId === runtime.boardId)
      setState(already ? 'hidden' : 'offer')
    })
    return () => {
      live = false
    }
  }, [eligible, runtime.boardId])

  if (!eligible) return null
  if (state === 'hidden' || state === 'checking') return null

  if (state === 'kept') {
    return (
      <span className="of-status__kept" data-testid="board-kept">
        In your boards
      </span>
    )
  }

  return (
    <button
      type="button"
      className="of-status__share"
      data-testid="keep-board"
      disabled={state === 'joining'}
      title="Keep this board in your list, so you can find it without the link"
      onClick={() => {
        if (key === null) return
        setState('joining')
        void joinBoard(runtime.boardId, key).then((role) => {
          /*
           * A key that opens nothing answers exactly as a board that does not
           * exist does, so there is nothing here to explain to the person —
           * and nothing gained by pretending the button worked.
           */
          setState(role === null ? 'offer' : 'kept')
        })
      }}
    >
      <span className="of-status__share-label">
        {state === 'joining' ? 'Keeping…' : 'Keep this board'}
      </span>
    </button>
  )
}
