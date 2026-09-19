import { useState } from 'react'

import { useBoardDocument } from '../hooks/use-document-object.js'
import { useCommands } from '../hooks/use-commands.js'
import { useUndoState } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { BENCH_TOOLS_ENABLED } from '../app/bench-flag.js'
import { SOURCE_URL } from '../app/source-link.js'
import { applyTheme, readTheme, type Theme } from '../app/theme.js'
import { AccountControl } from './AccountControl.js'
import { BoardExit } from './BoardExit.js'
import { BoardTitle } from './BoardTitle.js'
import { DevPanel } from './DevPanel.js'
import { ShareControl } from './ShareControl.js'
import { AfterHoursIcon, RedoIcon, UndoIcon } from './icons.js'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl'

/**
 * The record line: what is on the page, and the corrections made to it.
 *
 * History lives here rather than in the tool rail because undo is not something
 * you create — it is an account of what happened, which is what this line is
 * for. Counts are mono and tabular so they change without the row reflowing.
 */
export function StatusBar() {
  const document = useBoardDocument()
  const zoom = useInteractionStore((state) => state.viewport.zoom)
  const selection = useInteractionStore((state) => state.selection)
  const commands = useCommands()
  const { canUndo, canRedo, undoLabel } = useUndoState()
  /*
   * The only piece of local state on this line, and it is a mirror rather than
   * a source: the document element already holds the truth, and localStorage
   * holds it across reloads. This exists so React re-renders the pressed state.
   */
  const [theme, setTheme] = useState<Theme>(readTheme)
  const afterHours = theme === 'after-hours'

  return (
    <div className="of-status" data-testid="status-bar">
      {/* Which index this page is in, then which page it is. */}
      <BoardExit />
      <span className="of-status__rule" aria-hidden="true" />
      {/* The board names itself before it accounts for itself. */}
      <BoardTitle title={document.meta.title} />
      <span className="of-status__rule" aria-hidden="true" />
      <div className="of-status__history">
        <button
          type="button"
          className="of-status__action"
          disabled={!canUndo}
          aria-label={undoLabel === null ? 'Undo' : `Undo ${undoLabel}`}
          title={undoLabel === null ? `Undo (${mod}Z)` : `Undo ${undoLabel} (${mod}Z)`}
          data-testid="undo"
          onClick={() => commands.undo()}
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          className="of-status__action"
          disabled={!canRedo}
          aria-label="Redo"
          title={`Redo (${mod}⇧Z)`}
          data-testid="redo"
          onClick={() => commands.redo()}
        >
          <RedoIcon />
        </button>
      </div>

      <span className="of-status__rule" aria-hidden="true" />

      <span className="of-status__counts" data-testid="object-count">
        <b>{document.objects.size}</b> objects
      </span>
      <span className="of-status__counts">
        <b>{selection.size}</b> selected
      </span>
      <span className="of-status__counts">{Math.round(zoom * 100)}%</span>

      <span className="of-status__rule" aria-hidden="true" />

      {/*
       * The AGPL section 13 offer of source. A hosted, modified version has to
       * make this available to the people using it — see app/source-link.ts.
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
       * Who else is here, and the way to invite them. Next to the source offer
       * because it is the same kind of thing: not a record of the page, but
       * something about the page you are reading.
       */}
      <ShareControl />
      <AccountControl />

      {/*
       * App-level apparatus sits at this end of the line, after the rule — the
       * source offer established that, and a theme is the same kind of thing:
       * not a record of the page, but something about the page you are reading.
       */}
      <button
        type="button"
        className="of-status__action"
        aria-pressed={afterHours}
        aria-label="After Hours theme"
        title={afterHours ? 'After Hours — on' : 'After Hours — off'}
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
       * Statically guarded, not runtime-guarded: the flag is replaced at build
       * time, so the branch is dead code and the bundler drops both it and the
       * DevPanel module. A runtime check would ship the whole panel to
       * production just to never render it.
       */}
      {BENCH_TOOLS_ENABLED && <DevPanel />}
    </div>
  )
}
