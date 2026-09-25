import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { useCommands } from '../hooks/use-commands.js'
import { useOpenFrame } from '../runtime/context.js'

/**
 * The board's name: the heading of the page's navigation, and of the tab.
 *
 * Set in the interface's own face at 600, because it is the page's name rather
 * than one more readout on a record line — which is what it was while the line
 * sat along the foot of the window.
 *
 * It takes the room the bar has before it shortens, and a name that still does
 * not fit is shown whole in its tip: somebody returning to a board days later
 * reads it by its name, and a name cut off with no way to see the rest is a
 * board they have to open an editor to identify.
 *
 * Click to edit, the same interaction the zoom percentage already has, so the
 * bar has one way of turning a readout into an input rather than two.
 */
export function BoardTitle({ title }: { readonly title: string }) {
  const commands = useCommands()
  const { runtime } = useOpenFrame()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const input = useRef<HTMLInputElement>(null)
  const shown = useRef<HTMLButtonElement>(null)
  /*
   * Whether the name is cut off where it is drawn. Measured, because only the
   * layout knows: it depends on the face, the window and what else is on the
   * bar. Re-measured when any of those change size.
   */
  const [clipped, setClipped] = useState(false)
  useLayoutEffect(() => {
    const element = shown.current
    if (element === null) return
    const measure = (): void => {
      setClipped(element.scrollWidth > element.clientWidth + 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [title, editing])

  /*
   * Where the keyboard goes when the field closes. Enter and Escape hand it
   * back to the name, so the next Tab continues from here; it used to fall to
   * the page when the field unmounted, and a keyboard user started again from
   * the top after every rename (WCAG 2.4.3). A click elsewhere keeps it
   * wherever the click put it.
   */
  const returnFocus = useRef(false)
  useEffect(() => {
    if (editing) input.current?.select()
    else if (returnFocus.current) {
      returnFocus.current = false
      shown.current?.focus()
    }
  }, [editing])

  const open = (): void => {
    setDraft(title)
    setEditing(true)
  }

  const commit = (): void => {
    setEditing(false)
    // Unchanged is not a command: renaming a board to what it is already
    // called must not put a step in the undo stack that appears to do nothing.
    if (draft.trim() === title) return
    // A refused name — empty, or too long — puts the old one back rather than
    // leaving the input holding text the board does not have.
    if (!commands.setBoardTitle(draft)) setDraft(title)
  }

  if (runtime.readOnly) {
    return (
      <span className="of-status__title of-status__title--fixed" data-testid="board-title">
        {title}
      </span>
    )
  }

  if (!editing) {
    return (
      <button
        ref={shown}
        type="button"
        className="of-status__title"
        data-testid="board-title"
        // Named by the name alone: the tip is drawn by `::after`, and generated
        // content is otherwise read INTO a name taken from the contents.
        aria-label={title}
        // The whole name when the bar has cut it off; otherwise, what a press does.
        data-tip={clipped ? title : 'Rename this board'}
        aria-description="Rename this board"
        onClick={open}
      >
        {title}
      </button>
    )
  }

  return (
    <input
      ref={input}
      className="of-status__title of-status__title--editing"
      data-testid="board-title-input"
      aria-label="Board name"
      value={draft}
      maxLength={200}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        // Stopped here, not bubbled: the canvas keymap claims single letters
        // for tools, so typing a board name would otherwise place a sticky.
        event.stopPropagation()
        if (event.key === 'Enter') {
          event.preventDefault()
          returnFocus.current = true
          commit()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          returnFocus.current = true
          setDraft(title)
          setEditing(false)
        }
      }}
    />
  )
}
