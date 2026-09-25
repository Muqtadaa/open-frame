import { useState, type MouseEvent } from 'react'

import { HOME_HREF } from '../app/route.js'
import { useOpenFrame } from '../runtime/context.js'
import { BackIcon } from '../controls/icons.js'

/**
 * The way out of a board.
 *
 * Until this existed there was none: you entered a board and the only exit was
 * editing the URL. It sits at the head of the record line, before the board
 * names itself, because that is the order a bound notebook reads — which index
 * this page is in, then which page it is.
 *
 * A real anchor, not a button that navigates. Cmd-click, middle-click and
 * "open in new tab" are how people keep the board they are on while looking at
 * the list, and a button throws all three away.
 */
export function BoardExit() {
  const { runtime } = useOpenFrame()
  const [leaving, setLeaving] = useState(false)

  /*
   * Autosave coalesces commands into one write, so there is a half-second
   * window where the board on screen is ahead of the board on disk. Leaving
   * inside that window used to drop the last thing done — which nothing could
   * hit before, because there was no one-click way off the board.
   */
  const leave = (event: MouseEvent<HTMLAnchorElement>): void => {
    // Anything but a plain left click is the browser's to handle: this is what
    // keeps open-in-new-tab working. Those paths leave this page alive, so the
    // pending save lands on its own.
    if (event.defaultPrevented) return
    if (event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

    event.preventDefault()
    setLeaving(true)
    void runtime.flush().finally(() => {
      window.location.assign(HOME_HREF)
    })
  }

  return (
    <a
      className="of-status__exit"
      href={HOME_HREF}
      data-testid="board-exit"
      aria-label="All boards"
      data-tip="All boards"
      aria-busy={leaving}
      onClick={leave}
    >
      <BackIcon />
      <span className="of-status__exit-label">All boards</span>
    </a>
  )
}
