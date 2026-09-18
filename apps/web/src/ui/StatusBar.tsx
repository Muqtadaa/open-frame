import { useBoardDocument } from '../hooks/use-document-object.js'
import { useCommands } from '../hooks/use-commands.js'
import { useUndoState } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { BENCH_TOOLS_ENABLED } from '../app/bench-flag.js'
import { SOURCE_URL } from '../app/source-link.js'
import { DevPanel } from './DevPanel.js'
import { RedoIcon, UndoIcon } from './icons.js'

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

  return (
    <div className="of-status" data-testid="status-bar">
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
       * Statically guarded, not runtime-guarded: the flag is replaced at build
       * time, so the branch is dead code and the bundler drops both it and the
       * DevPanel module. A runtime check would ship the whole panel to
       * production just to never render it.
       */}
      {BENCH_TOOLS_ENABLED && <DevPanel />}
    </div>
  )
}
