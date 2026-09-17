import { COLOR_TOKENS, type ColorToken } from '@openframe/core'

import { useCommands } from '../hooks/use-commands.js'
import { useUndoState } from '../hooks/use-document-object.js'
import { useInteractionStore, type Tool } from '../interaction/interaction-store.js'

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'select', label: 'Select', hint: 'V' },
  { id: 'sticky', label: 'Sticky', hint: 'N' },
  { id: 'pan', label: 'Pan', hint: 'H' },
]

export function Toolbar() {
  const tool = useInteractionStore((state) => state.tool)
  const setTool = useInteractionStore((state) => state.setTool)
  const selection = useInteractionStore((state) => state.selection)
  const commands = useCommands()
  const { canUndo, canRedo, undoLabel } = useUndoState()

  return (
    <div className="of-toolbar" role="toolbar" aria-label="Board tools">
      <div className="of-toolbar__group">
        {TOOLS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`of-button${tool === entry.id ? ' of-button--active' : ''}`}
            aria-pressed={tool === entry.id}
            title={`${entry.label} (${entry.hint})`}
            data-testid={`tool-${entry.id}`}
            onClick={() => setTool(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="of-toolbar__group">
        <button
          type="button"
          className="of-button"
          disabled={!canUndo}
          title={undoLabel === null ? 'Undo' : `Undo ${undoLabel}`}
          data-testid="undo"
          onClick={() => commands.undo()}
        >
          Undo
        </button>
        <button
          type="button"
          className="of-button"
          disabled={!canRedo}
          data-testid="redo"
          onClick={() => commands.redo()}
        >
          Redo
        </button>
      </div>

      <div className="of-toolbar__group of-toolbar__group--swatches">
        {COLOR_TOKENS.map((color: ColorToken) => (
          <button
            key={color}
            type="button"
            className="of-swatch"
            style={{ background: `var(--of-sticky-${color})` }}
            aria-label={`Set colour ${color}`}
            data-testid={`swatch-${color}`}
            disabled={selection.size === 0}
            onClick={() => commands.setColor([...selection], color)}
          />
        ))}
      </div>

      <div className="of-toolbar__group of-toolbar__group--end">
        <button
          type="button"
          className="of-button"
          disabled={selection.size === 0}
          data-testid="delete"
          onClick={() => commands.deleteSelection()}
        >
          Delete
        </button>
      </div>
    </div>
  )
}
