import { useEffect, useRef, useSyncExternalStore } from 'react'

import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { useRoomStatus } from '../hooks/use-room-status.js'
import { safetyWords } from './safety-words.js'
import { BENCH_TOOLS_ENABLED } from '../app/bench-flag.js'
import { AccountControl } from './AccountControl.js'
import { BoardExit } from './BoardExit.js'
import { BoardMenu } from './BoardMenu.js'
import { BoardTitle } from './BoardTitle.js'
import { Inbox } from './Inbox.js'
import { DevPanel } from './DevPanel.js'
import { Session } from './Session.js'
import { ShareControl } from './ShareControl.js'

/**
 * The board's navigation: the way out, the board's name, what has happened to
 * it and whether it is safe, then the app's own apparatus.
 *
 * Undo and redo are not here: they sit with zoom and snap at the foot of the
 * board (HistoryButtons). Readouts are mono and tabular so they change without
 * the bar reflowing.
 */
export function StatusBar() {
  const document = useBoardDocument()
  const selection = useInteractionStore((state) => state.selection)
  const { runtime } = useOpenFrame()
  const save = useSyncExternalStore(runtime.saveStatus.subscribe, runtime.saveStatus.get)
  const room = useRoomStatus()
  const safety = safetyWords(save, room)
  const title = document.meta.title
  const rename = useRef<(() => void) | null>(null)

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
        <BoardTitle title={title} renameRef={rename} />
      </h1>
      {/* Outside the heading, so the page is not named "Untitled board Board". */}
      <BoardMenu
        onRename={
          runtime.readOnly
            ? null
            : () => {
                rename.current?.()
              }
        }
      />
      <span className="of-status__rule" aria-hidden="true" />

      {/*
       * Whether the work is safe: the copy on this device and, on a shared
       * board, whether everybody else is getting it (safety-words.ts).
       * Announced only when it fails: "Saving…" and "Saved" after every
       * keystroke would be noise to a screen reader.
       */}
      <span
        className={`of-status__save of-status__save--${save} of-status__save--${safety.tone}`}
        data-testid="save-state"
        data-state={save}
        data-room={room ?? 'none'}
        data-tip={safety.tip}
        aria-description={safety.tip}
        aria-live={save === 'failed' ? 'assertive' : 'off'}
      >
        {room !== null && (
          <span className={`of-status__dot of-status__dot--${room}`} aria-hidden="true" />
        )}
        {safety.label}
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

      {/* The session's clock, beside the session's people. */}
      <Session />
      <ShareControl />
      {/*
       * Being named somewhere else has to reach you HERE. The bell was on the
       * dashboard alone, which is the one screen you are not on while you
       * work — so a mention waited until you happened to go home.
       */}
      <Inbox />
      <AccountControl />

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
