import { SHAPE_KINDS, screenToWorld, type ColorToken } from '@openframe/core'
import { COLOR_TOKENS } from '@openframe/core'
import { useRef, useState } from 'react'

import { useCommands } from '../hooks/use-commands.js'
import { useImageImport } from '../hooks/use-image-import.js'
import { ALLOWED_IMAGE_TYPES } from '../runtime/asset-validation.js'
import { useUndoState } from '../hooks/use-document-object.js'
import { useInteractionStore, type Tool } from '../interaction/interaction-store.js'
import { SURFACE_VARS } from '../scene/style-tokens.js'
import {
  CursorIcon,
  HandIcon,
  RedoIcon,
  ConnectorIcon,
  FrameIcon,
  ImageIcon,
  ShapeIcon,
  StickyIcon,
  TextIcon,
  TrashIcon,
  UndoIcon,
} from './icons.js'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl'

interface ToolSpec {
  readonly id: Tool
  readonly label: string
  readonly shortcut: string
}

const TOOLS: readonly ToolSpec[] = [
  { id: 'select', label: 'Select', shortcut: 'V' },
  { id: 'pan', label: 'Hand', shortcut: 'H' },
  { id: 'sticky', label: 'Sticky', shortcut: 'S' },
  { id: 'text', label: 'Text', shortcut: 'T' },
  { id: 'shape', label: 'Shape', shortcut: 'U' },
  { id: 'frame', label: 'Frame', shortcut: 'F' },
  { id: 'connector', label: 'Connect', shortcut: 'C' },
]

/**
 * The floating tool rail.
 *
 * Vertical and overlaying the canvas rather than a bar above it, because the
 * canvas is the product: chrome that consumes a horizontal band costs vertical
 * board space on every screen, and canvas tools are a column everywhere users
 * have already learned them.
 */
export function Toolbar() {
  const tool = useInteractionStore((state) => state.tool)
  const shapeKind = useInteractionStore((state) => state.shapeKind)
  const setTool = useInteractionStore((state) => state.setTool)
  const cycleShape = useInteractionStore((state) => state.cycleShape)
  const selectionSize = useInteractionStore((state) => state.selection.size)
  const commands = useCommands()
  const { canUndo, canRedo, undoLabel } = useUndoState()
  const [shapesOpen, setShapesOpen] = useState(false)
  const importImages = useImageImport()
  const fileInput = useRef<HTMLInputElement>(null)

  const icon = (id: Tool) => {
    switch (id) {
      case 'select':
        return <CursorIcon />
      case 'pan':
        return <HandIcon />
      case 'sticky':
        return <StickyIcon />
      case 'text':
        return <TextIcon />
      case 'shape':
        return <ShapeIcon kind={shapeKind} />
      case 'frame':
        return <FrameIcon />
      case 'connector':
        return <ConnectorIcon />
    }
  }

  return (
    <div className="of-rail" role="toolbar" aria-label="Board tools" aria-orientation="vertical">
      <div className="of-rail__group">
        {TOOLS.map((spec) => (
          <div key={spec.id} className="of-rail__slot">
            <button
              type="button"
              className={`of-tool${tool === spec.id ? ' of-tool--active' : ''}`}
              aria-pressed={tool === spec.id}
              title={`${spec.label} (${spec.shortcut})`}
              data-testid={`tool-${spec.id}`}
              onClick={() => {
                if (spec.id === 'shape' && tool === 'shape') cycleShape()
                else setTool(spec.id)
              }}
              onContextMenu={(event) => {
                if (spec.id !== 'shape') return
                event.preventDefault()
                setShapesOpen((open) => !open)
              }}
            >
              {icon(spec.id)}
              <span className="of-tool__label">{spec.label}</span>
            </button>

            {spec.id === 'shape' && (
              <button
                type="button"
                className="of-rail__more"
                aria-label="Choose shape"
                aria-expanded={shapesOpen}
                data-testid="shape-menu"
                onClick={() => setShapesOpen((open) => !open)}
              >
                <span aria-hidden="true">▸</span>
              </button>
            )}

            {spec.id === 'shape' && shapesOpen && (
              <div className="of-flyout" role="menu" aria-label="Shapes">
                {SHAPE_KINDS.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="menuitemradio"
                    aria-checked={shapeKind === kind}
                    className={`of-flyout__item${shapeKind === kind ? ' of-flyout__item--active' : ''}`}
                    data-testid={`shape-${kind}`}
                    onClick={() => {
                      // Cycle until it lands: keeps a single source of truth for
                      // the variant instead of a second setter to keep in sync.
                      let guard = SHAPE_KINDS.length
                      const store = useInteractionStore.getState()
                      store.setTool('shape')
                      while (useInteractionStore.getState().shapeKind !== kind && guard-- > 0) {
                        useInteractionStore.getState().cycleShape()
                      }
                      setShapesOpen(false)
                    }}
                  >
                    <ShapeIcon kind={kind} />
                    <span>{kind}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="of-rail__divider" />

      <div className="of-rail__group">
        {/*
          * A button rather than a tool mode. Every other tool places something
          * the app can invent; an image needs a file first, so there is nothing
          * to arm — clicking the canvas afterwards would have no meaning.
          */}
        <button
          type="button"
          className="of-tool"
          title="Insert image"
          data-testid="tool-image"
          onClick={() => fileInput.current?.click()}
        >
          <ImageIcon />
          <span className="of-tool__label">Image</span>
        </button>
        <input
          ref={fileInput}
          type="file"
          className="of-visually-hidden"
          accept={ALLOWED_IMAGE_TYPES.join(',')}
          multiple
          tabIndex={-1}
          onChange={(event) => {
            const files = [...(event.target.files ?? [])]
            // Reset so choosing the same file twice in a row fires `change`
            // again — otherwise the second attempt silently does nothing.
            event.target.value = ''
            if (files.length === 0) return
            const { viewport, canvasSize } = useInteractionStore.getState()
            void importImages(
              files,
              screenToWorld(viewport, { x: canvasSize.width / 2, y: canvasSize.height / 2 }),
            )
          }}
        />
      </div>

      <div className="of-rail__divider" />

      <div className="of-rail__group">
        <button
          type="button"
          className="of-tool"
          disabled={!canUndo}
          title={undoLabel === null ? `Undo (${mod}Z)` : `Undo ${undoLabel} (${mod}Z)`}
          data-testid="undo"
          onClick={() => commands.undo()}
        >
          <UndoIcon />
          <span className="of-tool__label">Undo</span>
        </button>
        <button
          type="button"
          className="of-tool"
          disabled={!canRedo}
          title={`Redo (${mod}⇧Z)`}
          data-testid="redo"
          onClick={() => commands.redo()}
        >
          <RedoIcon />
          <span className="of-tool__label">Redo</span>
        </button>
        <button
          type="button"
          className="of-tool of-tool--danger"
          disabled={selectionSize === 0}
          title="Delete (Del)"
          data-testid="delete"
          onClick={() => commands.deleteSelection()}
        >
          <TrashIcon />
          <span className="of-tool__label">Delete</span>
        </button>
      </div>

      <div className="of-rail__divider" />

      <div className="of-rail__swatches" role="group" aria-label="Colour">
        {COLOR_TOKENS.map((color: ColorToken) => (
          <button
            key={color}
            type="button"
            className="of-swatch"
            style={{ background: SURFACE_VARS[color] }}
            aria-label={`Set colour ${color}`}
            title={color}
            data-testid={`swatch-${color}`}
            disabled={selectionSize === 0}
            onClick={() => {
              commands.setColor([...useInteractionStore.getState().selection], color)
            }}
          />
        ))}
      </div>
    </div>
  )
}
