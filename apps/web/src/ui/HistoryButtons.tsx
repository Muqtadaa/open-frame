import { useRef } from 'react'

import { RedoIcon, UndoIcon } from '../controls/icons.js'
import { useCommands } from '../hooks/use-commands.js'
import { useUndoState } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { MOD_KEY } from '../interaction/keymap.js'

const mod = MOD_KEY

/**
 * Undo and redo, in the cluster at the foot of the board.
 *
 * With zoom and snap rather than on the masthead: they are how the board is
 * HANDLED, not what it is called or whether it is safe, and on a fresh board
 * their two disabled buttons took the bar's best place, right after its name.
 * The keys are unchanged; these are the touch and pointer way to the same.
 */
export function HistoryButtons() {
  const commands = useCommands()
  const { canUndo, canRedo, undoLabel: label } = useUndoState()
  /*
   * In sentence case where it follows "Undo": the command's own label is a
   * title ("Restyle 1 object"), and "Undo Restyle 1 object" put a capital in
   * the middle of a sentence.
   */
  const undoLabel = label === null ? null : label.charAt(0).toLowerCase() + label.slice(1)
  const editingId = useInteractionStore((state) => state.editingId)

  /**
   * Undo and redo, meaning whatever they mean where the caret is.
   *
   * With a text editor open these drive the FIELD's own history, exactly as
   * Ctrl+Z already did — typing into a note and pressing the button used to
   * blur the field, commit what was typed, and then undo something else
   * entirely. Two controls bound to one shortcut have to agree.
   *
   * `execCommand` is deprecated and is still the only way to drive a native
   * field's undo stack. There is no replacement; browsers keep it working
   * because editors depend on it.
   */
  const undoButton = useRef<HTMLButtonElement>(null)
  const redoButton = useRef<HTMLButtonElement>(null)
  const history = (step: 'undo' | 'redo'): void => {
    if (editingId !== null && window.document.execCommand(step)) return
    const self = step === 'undo' ? undoButton.current : redoButton.current
    const other = step === 'undo' ? redoButton.current : undoButton.current
    const pressedByKeyboard = window.document.activeElement === self
    if (step === 'undo') commands.undo()
    else commands.redo()
    /*
     * The last undo disables the button it was pressed on, and a disabled
     * button loses focus to the page. The keyboard moves to the other one —
     * which that very step has just enabled — rather than back to the start.
     */
    if (pressedByKeyboard) {
      requestAnimationFrame(() => {
        if (self?.disabled === true) other?.focus()
      })
    }
  }

  /*
   * And the buttons must not TAKE focus, or the field blurs and commits
   * before the click is handled — which is the bug, not a detail of it.
   */
  const keepFocus = (event: { preventDefault: () => void }): void => {
    event.preventDefault()
  }

  return (
    <div className="of-zoom__history" role="group" aria-label="History">
      <button
        ref={undoButton}
        type="button"
        className="of-icon-button"
        // Never disabled while editing: the field has its own history, and
        // the board's emptiness says nothing about whether it does.
        disabled={!canUndo && editingId === null}
        aria-label={undoLabel === null ? 'Undo' : `Undo ${undoLabel}`}
        data-tip={undoLabel === null ? `Undo (${mod}Z)` : `Undo ${undoLabel} (${mod}Z)`}
        aria-description={undoLabel === null ? `Undo (${mod}Z)` : `Undo ${undoLabel} (${mod}Z)`}
        data-testid="undo"
        onMouseDown={keepFocus}
        onClick={() => {
          history('undo')
        }}
      >
        <UndoIcon />
      </button>
      <button
        ref={redoButton}
        type="button"
        className="of-icon-button"
        disabled={!canRedo && editingId === null}
        aria-label="Redo"
        data-tip={`Redo (${mod}⇧Z)`}
        aria-description={`Redo (${mod}⇧Z)`}
        data-testid="redo"
        onMouseDown={keepFocus}
        onClick={() => {
          history('redo')
        }}
      >
        <RedoIcon />
      </button>
    </div>
  )
}
