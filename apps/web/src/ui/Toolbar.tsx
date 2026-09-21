import { SHAPE_KINDS, screenToWorld, type ShapeKind } from '@openframe/core'
import { useRef, useState } from 'react'

import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { useImageImport } from '../hooks/use-image-import.js'
import { TableSizePicker } from './TableSizePicker.js'
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
  /*
   * ONE menu at a time, as one piece of state rather than two booleans.
   *
   * Two independent flags let both flyouts be open at once, stacked over each
   * other in the same strip beside the rail — reachable only by clicking one
   * disclosure and then the other, which is exactly the sort of thing nobody
   * tries until a user does.
   */
  const [openMenu, setOpenMenu] = useState<'shape' | 'table' | null>(null)
  /*
   * The button the open menu hangs off, in screen pixels.
   *
   * STATE, captured from the press — not a ref read back during render, which
   * is a value React is entitled to have changed underneath you and does not
   * re-render for. The rail does not move while a menu is open, so the
   * rectangle taken at the press is the rectangle to place against.
   */
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const canvasSize = useInteractionStore((state) => state.canvasSize)
  const shapesOpen = openMenu === 'shape'
  const sizeOpen = openMenu === 'table'
  const toggle = (menu: 'shape' | 'table', from: HTMLElement): void => {
    setAnchor(from.getBoundingClientRect())
    setOpenMenu((open) => (open === menu ? null : menu))
  }
  const tableSize = useInteractionStore((state) => state.tableSize)
  const setTableSize = useInteractionStore((state) => state.setTableSize)
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
            onClick={(event) => {
              if (spec.id === 'shape' && tool === 'shape') cycleShape()
              /*
               * Pressing Table again opens the size chooser. The size is the
               * first thing you know about a table you are making, so the
               * second press is far more likely to mean "a different shape"
               * than "the same one again".
               */
              else if (spec.id === 'table' && tool === 'table') toggle('table', event.currentTarget)
              else setTool(spec.id)
            }}
            onContextMenu={(event) => {
              if (spec.id !== 'shape') return
              event.preventDefault()
              toggle('shape', event.currentTarget)
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
              onClick={(event) => {
                toggle('shape', event.currentTarget)
              }}
            >
              <DisclosureIcon />
            </button>
          )}

          {spec.id === 'table' && (
            <button
              type="button"
              className="of-rail__more"
              aria-label="Choose table size"
              aria-expanded={sizeOpen}
              data-testid="table-menu"
              onClick={(event) => {
                toggle('table', event.currentTarget)
              }}
            >
              <DisclosureIcon />
            </button>
          )}

          {/*
            * On the SAME surface every other floating thing uses, which places
            * it and clamps it inside the window. It used to pin itself to the
            * rail slot with `position: absolute; top: 0`, so on a 420-pixel
            * window it ran 48 pixels off the bottom of the screen, where
            * nothing could reach it. Nothing about being in the rail rather
            * than on the board made that a different problem.
            */}
          {spec.id === 'table' && sizeOpen && (
            <AnchoredSurface
              anchor={anchor}
              surface={canvasSize}
              prefer={['right', 'left']}
              testId="table-size-flyout"
            >
              <div className="of-flyout of-flyout--wide">
                <TableSizePicker
                  size={tableSize}
                  onChoose={(size) => {
                    // Selecting the tool as well as the size: choosing 4x6 is
                    // saying you are about to place one.
                    setTableSize(size)
                    setOpenMenu(null)
                  }}
                />
              </div>
            </AnchoredSurface>
          )}

          {spec.id === 'shape' && shapesOpen && (
            <AnchoredSurface
              anchor={anchor}
              surface={canvasSize}
              prefer={['right', 'left']}
              testId="shape-flyout"
            >
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
                    setOpenMenu(null)
                  }}
                >
                  <ShapeIcon kind={kind} />
                  <span>{kind}</span>
                </button>
              ))}
            </div>
            </AnchoredSurface>
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
