import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { useBoardDocument } from '../hooks/use-document-object.js'
import { useCommands } from '../hooks/use-commands.js'
import { useUndoState } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import type { SaveState } from '../runtime/context.js'
import { BENCH_TOOLS_ENABLED } from '../app/bench-flag.js'
import { SOURCE_URL } from '../app/source-link.js'
import { applyTheme, readTheme, type Theme } from '../app/theme.js'
import { AccountControl } from './AccountControl.js'
import { BoardExit } from './BoardExit.js'
import { BoardTitle } from './BoardTitle.js'
import { Mentions } from './Mentions.js'
import { DevPanel } from './DevPanel.js'
import { ShareControl } from './ShareControl.js'
import { AfterHoursIcon, RedoIcon, UndoIcon } from '../controls/icons.js'
import { MOD_KEY } from '../interaction/keymap.js'

const mod = MOD_KEY

/**
 * What the bar says about the copy on this device, and what its tip adds.
 *
 * In the product's own words and nothing more: "Saved" is the whole of the
 * reassurance a local-first board owes somebody, and the tip says where. A
 * failed write says what to do, because it used to reach only the console.
 */
const SAVE_WORDS: Readonly<Record<SaveState, { label: string; tip: string }>> = {
  saved: { label: 'Saved', tip: 'Saved on this device' },
  pending: { label: 'Saving…', tip: 'Saving on this device' },
  saving: { label: 'Saving…', tip: 'Saving on this device' },
  failed: {
    label: 'Not saved',
    tip: 'The last change could not be saved on this device. Keep this tab open and try again.',
  },
  'read-only': {
    label: 'Read only',
    tip: 'This board could not be fully read, so nothing is written back to it',
  },
}

/**
 * The board's navigation: the way out, the board's name, what has happened to
 * it and whether it is safe, then the app's own apparatus.
 *
 * History lives here rather than in the tool rail because undo is not something
 * you create — it is an account of what happened. Readouts are mono and
 * tabular so they change without the bar reflowing.
 */
export function StatusBar() {
  const document = useBoardDocument()
  const selection = useInteractionStore((state) => state.selection)
  const commands = useCommands()
  const { runtime } = useOpenFrame()
  const save = useSyncExternalStore(runtime.saveStatus.subscribe, runtime.saveStatus.get)
  const { canUndo, canRedo, undoLabel: label } = useUndoState()
  /*
   * In sentence case where it follows "Undo": the command's own label is a
   * title ("Restyle 1 object"), and "Undo Restyle 1 object" put a capital in
   * the middle of a sentence.
   */
  const undoLabel = label === null ? null : label.charAt(0).toLowerCase() + label.slice(1)
  /*
   * The only piece of local state on this line, and it is a mirror rather than
   * a source: the document element already holds the truth, and localStorage
   * holds it across reloads. This exists so React re-renders the pressed state.
   */
  const [theme, setTheme] = useState<Theme>(readTheme)
  const afterHours = theme === 'after-hours'
  const editingId = useInteractionStore((state) => state.editingId)
  const title = document.meta.title

  /*
   * The TAB carries the board's name too. Several boards open in one window,
   * or one found again in the history a week later, all read "OpenFrame"
   * otherwise — the one place a returning reader looks first said nothing.
   * The product's name comes second, as a page's site name does.
   */
  useEffect(() => {
    const before = window.document.title
    window.document.title = `${title} — OpenFrame`
    return () => {
      window.document.title = before
    }
  }, [title])

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
    /*
     * The page's navigation, and the board's name as its heading, so a screen
     * reader can reach both by landmark and heading as it would on any page.
     */
    <nav className="of-status" aria-label="Board" data-testid="status-bar">
      {/* Which index this page is in, then which page it is. */}
      <BoardExit />
      <span className="of-status__rule" aria-hidden="true" />
      {/* The board names itself before it accounts for itself. */}
      <h1 className="of-status__heading">
        <BoardTitle title={title} />
      </h1>
      <span className="of-status__rule" aria-hidden="true" />
      <div className="of-status__history">
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

      <span className="of-status__rule" aria-hidden="true" />

      {/*
       * Whether the work is safe, where a count of objects used to be. The
       * count said nothing anybody acted on; this is the one fact a
       * local-first board most needs to say, and a failed write used to
       * reach only the console. Announced only when it fails: "Saving…" and
       * "Saved" after every keystroke would be noise to a screen reader.
       */}
      <span
        className={`of-status__save of-status__save--${save}`}
        data-testid="save-state"
        data-state={save}
        data-tip={SAVE_WORDS[save].tip}
        aria-description={SAVE_WORDS[save].tip}
        aria-live={save === 'failed' ? 'assertive' : 'off'}
      >
        {SAVE_WORDS[save].label}
      </span>
      {/*
       * A selection, when there is one. "0 selected" stood on the bar
       * permanently, repeating what the record panel shows — and saying
       * nothing at all whenever nothing was chosen.
       */}
      {selection.size > 0 && (
        <span className="of-status__counts" data-testid="selection-count">
          <b>{selection.size}</b> selected
        </span>
      )}

      {/*
       * The zoom is NOT repeated here. It was in both bottom bars at once —
       * the same number twice, a few hundred pixels apart — and the one in
       * the zoom control is the one you can also type into and step with the
       * slider beside it. A readout next to the control that changes it is a
       * readout; the same figure on its own is a second thing to keep in
       * agreement for no gain.
       */}

      <span className="of-status__rule" aria-hidden="true" />

      {/*
       * Who else is here, and the way to invite them. Next to the source offer
       * because it is the same kind of thing: not a record of the page, but
       * something about the page you are reading.
       */}
      <ShareControl />
      {/*
       * Being named somewhere else has to reach you HERE. The bell was on the
       * dashboard alone, which is the one screen you are not on while you
       * work — so a mention waited until you happened to go home.
       */}
      <Mentions />
      <AccountControl />

      {/*
       * App-level apparatus sits at this end of the line, after the rule — the
       * source offer established that, and a theme is the same kind of thing:
       * not a record of the page, but something about the page you are reading.
       */}
      <button
        type="button"
        className="of-icon-button"
        aria-pressed={afterHours}
        aria-label="After Hours theme"
        data-tip={afterHours ? 'After Hours — on' : 'After Hours — off'}
        aria-description={afterHours ? 'After Hours — on' : 'After Hours — off'}
        data-testid="theme-toggle"
        onClick={() => {
          const next: Theme = afterHours ? 'notebook' : 'after-hours'
          setTheme(next)
          applyTheme(next)
        }}
      >
        <AfterHoursIcon />
      </button>

      {/*
       * The AGPL section 13 offer of source. A hosted, modified version has to
       * make this available to the people using it — see app/source-link.ts.
       * LAST and quietest: it must stay reachable, and it is the one thing on
       * the bar nobody reaches for while working. Run in among the account
       * controls, it read to a researcher as "data source".
       */}
      <a
        className="of-status__source"
        href={SOURCE_URL}
        target="_blank"
        rel="noreferrer"
        data-testid="source-link"
      >
        Source
      </a>

      {/*
       * Statically guarded, not runtime-guarded: the flag is replaced at build
       * time, so the branch is dead code and the bundler drops both it and the
       * DevPanel module. A runtime check would ship the whole panel to
       * production just to never render it.
       */}
      {BENCH_TOOLS_ENABLED && <DevPanel />}
    </nav>
  )
}
