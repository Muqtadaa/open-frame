import { useEffect, useRef, useState } from 'react'

import { useCommands } from '../hooks/use-commands.js'
import { useOpenFrame } from '../runtime/context.js'

/**
 * The board's name, at the head of the record line.
 *
 * Set as a specimen label — mono, lowercase-tolerant, tracked — because that
 * is how this world names a subject: the record panel's head does the same
 * thing for the object you have selected, and this is the same act one level
 * up. It is not mono to look technical; it is mono because it is the label on
 * the record.
 *
 * Click to edit, the same interaction the zoom percentage already has, so the
 * line has one way of turning a readout into an input rather than two.
 */
export function BoardTitle({ title }: { readonly title: string }) {
  const commands = useCommands()
  const { runtime } = useOpenFrame()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) input.current?.select()
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
        type="button"
        className="of-status__title"
        data-testid="board-title"
        title="Rename this board"
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
          commit()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          setDraft(title)
          setEditing(false)
        }
      }}
    />
  )
}
