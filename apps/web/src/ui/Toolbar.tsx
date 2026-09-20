import { SHAPE_KINDS, screenToWorld, type ShapeKind } from '@openframe/core'
import { useRef, useState } from 'react'

import { useImageImport } from '../hooks/use-image-import.js'
import { useInteractionStore, type Tool } from '../interaction/interaction-store.js'
import { ALLOWED_IMAGE_TYPES } from '../runtime/asset-validation.js'
import {
  CodeIcon,
  CommentIcon,
  ConnectorIcon,
  CursorIcon,
  DisclosureIcon,
  FrameIcon,
  HandIcon,
  ImageIcon,
  ShapeIcon,
  StickyIcon,
  TableIcon,
  TextIcon,
} from './icons.js'

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
  { id: 'table', label: 'Table', shortcut: 'G' },
  { id: 'code', label: 'Code', shortcut: 'K' },
  // Not a thing you put on the page, but a thing you put ON what is on the
  // page — and it belongs with the other modes rather than hidden in a menu,
  // because a comment you cannot find a way to leave is a comment nobody
  // leaves.
  { id: 'comment', label: 'Comment', shortcut: 'M' },
]

/**
 * The margin gutter: what you can put ON the page, and nothing else.
 *
 * It used to carry undo, redo, delete and a colour row as well, which is why it
 * ran two-thirds of the window height and why the swatches ended up as 12px
 * dots wrapping in its tail. Those act on a SELECTION, so they belong with the
 * selection — colour and the rest are in the inspector, history is on the
 * record line. What is left is one column of things you create.
 *
 * Labels are tooltips rather than standing text: eleven always-on captions were
 * most of the old height, and the icons carry their own meaning once the rail
 * is short enough to read as a set.
 */
export function Toolbar() {
  const tool = useInteractionStore((state) => state.tool)
  const shapeKind = useInteractionStore((state) => state.shapeKind)
  const setTool = useInteractionStore((state) => state.setTool)
  const cycleShape = useInteractionStore((state) => state.cycleShape)
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
      case 'table':
        return <TableIcon />
      case 'code':
        return <CodeIcon />
      case 'comment':
        return <CommentIcon />
    }
  }

  return (
    <div className="of-rail" role="toolbar" aria-label="Board tools" aria-orientation="vertical">
      {TOOLS.map((spec) => (
        <div key={spec.id} className="of-rail__slot">
          <button
            type="button"
            className={`of-tool${tool === spec.id ? ' of-tool--active' : ''}`}
            aria-pressed={tool === spec.id}
            aria-label={spec.label}
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
            <span className="of-tool__tip" aria-hidden="true">
              {spec.label}
              <kbd>{spec.shortcut}</kbd>
            </span>
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
              <DisclosureIcon />
            </button>
          )}

          {spec.id === 'shape' && shapesOpen && (
            <div className="of-flyout" role="menu" aria-label="Shapes">
              {SHAPE_KINDS.map((kind: ShapeKind) => (
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
                    useInteractionStore.getState().setTool('shape')
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

      <div className="of-rail__rule" />

      {/*
        * A button rather than a tool mode. Every other tool places something the
        * app can invent; an image needs a file first, so there is nothing to arm.
        */}
      <div className="of-rail__slot">
        <button
          type="button"
          className="of-tool"
          aria-label="Insert image"
          title="Insert image"
          data-testid="tool-image"
          onClick={() => fileInput.current?.click()}
        >
          <ImageIcon />
          <span className="of-tool__tip" aria-hidden="true">
            Image
          </span>
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
    </div>
  )
}
