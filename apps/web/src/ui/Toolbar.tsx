import { screenToWorld } from '@openframe/core'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'

import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { useImageImport } from '../hooks/use-image-import.js'
import { useScrollEdges } from '../hooks/use-scroll-edges.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { optionsOf, type ChromeTool, type Tool } from '../scene/tools.js'
import type { ObjectTool } from '../views/registry.js'
import { ALLOWED_IMAGE_TYPES } from '../runtime/asset-validation.js'
import { CommentIcon, CursorIcon, DisclosureIcon, HandIcon, ImageIcon } from '../controls/icons.js'

interface ToolSpec {
  readonly id: Tool
  readonly label: string
  readonly shortcut: string
  readonly icon: ReactNode
  /** The type's own tool, when it is one: its options picker hangs off it. */
  readonly declared?: ObjectTool
  /** What that tool has chosen now. */
  readonly options?: unknown
}

/** The chrome's own modes, which are not a type and so not the registry's. */
const CHROME: Readonly<Record<ChromeTool, ToolSpec>> = {
  select: { id: 'select', label: 'Select', shortcut: 'V', icon: <CursorIcon /> },
  pan: { id: 'pan', label: 'Hand', shortcut: 'H', icon: <HandIcon /> },
  comment: { id: 'comment', label: 'Comment', shortcut: 'M', icon: <CommentIcon /> },
}

/**
 * The margin gutter: what you can put ON the page, and nothing else.
 *
 * It used to carry undo, redo, delete and a colour row as well, which is why it
 * ran two-thirds of the window height and why the swatches ended up as 12px
 * dots wrapping in its tail. Those act on a SELECTION, so they belong with the
 * selection — colour and the rest are in the inspector, history is on the
 * navigation bar. What is left is one column of things you create.
 *
 * Labels are tooltips rather than standing text: eleven always-on captions were
 * most of the old height, and the icons carry their own meaning once the rail
 * is short enough to read as a set.
 */
export function Toolbar() {
  const { views } = useOpenFrame()
  const tool = useInteractionStore((state) => state.tool)
  const toolOptions = useInteractionStore((state) => state.toolOptions)
  const setTool = useInteractionStore((state) => state.setTool)
  const setToolOptions = useInteractionStore((state) => state.setToolOptions)
  /*
   * ONE menu at a time, as one piece of state rather than two booleans.
   *
   * Two independent flags let both flyouts be open at once, stacked over each
   * other in the same strip beside the rail — reachable only by clicking one
   * disclosure and then the other, which is exactly the sort of thing nobody
   * tries until a user does.
   */
  // The TYPE whose options are open.
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  // Says which end has more tools, on a window too short for all of them.
  const rail = useRef<HTMLDivElement>(null)
  useScrollEdges(rail)
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
  /*
   * Where focus goes back to when a menu closes without a choice: the control
   * that opened it, so a keyboard user is not dropped at the top of the page.
   */
  const opener = useRef<HTMLElement | null>(null)
  const flyout = useRef<HTMLDivElement>(null)
  const toggle = (menu: string, from: HTMLElement): void => {
    opener.current = from
    setAnchor(from.getBoundingClientRect())
    setOpenMenu((open) => (open === menu ? null : menu))
  }
  const close = (refocus: boolean): void => {
    setOpenMenu(null)
    if (refocus) opener.current?.focus()
  }

  /*
   * A menu that closed only when something in it was chosen was a trap: Escape
   * and the board both ignored it. Escape now closes it (and stops there, so
   * the board does not ALSO drop the selection), and a press anywhere but the
   * menu or the rail closes it too — the rail's own buttons decide for
   * themselves, or pressing the disclosure would close and reopen it.
   */
  useEffect(() => {
    if (openMenu === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      event.preventDefault()
      setOpenMenu(null)
      opener.current?.focus()
    }
    const onPress = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (flyout.current?.contains(target) === true) return
      if (target instanceof Element && target.closest('.of-rail') !== null) return
      setOpenMenu(null)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onPress, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onPress, true)
    }
  }, [openMenu])
  const importImages = useImageImport()
  const fileInput = useRef<HTMLInputElement>(null)

  /*
   * The rail in three runs, with a rule between each: getting around the
   * board, making things on it, and annotating what is there. One run of ten
   * with a single rule setting Image apart read as a list rather than a set.
   *
   * What can be made is whatever declares a tool on its view, in the order
   * the tools say; `image` stands for the one control that is not a mode
   * (below). Annotating is not a thing you put on the page but a thing you put
   * ON what is there — and it belongs with the other modes rather than hidden
   * in a menu, because a comment you cannot find a way to leave is a comment
   * nobody leaves.
   */
  const made: ToolSpec[] = views.tools().map((declared) => {
    const options = optionsOf(declared, toolOptions)
    const { Icon } = declared.tool
    return {
      id: declared.type,
      label: declared.tool.label,
      shortcut: (declared.tool.keys[0] ?? declared.tool.cycleKey ?? '').toUpperCase(),
      icon: <Icon options={options} />,
      declared: declared.tool,
      options,
    }
  })
  const groups: readonly {
    readonly label: string
    readonly items: readonly (ToolSpec | 'image')[]
  }[] = [
    { label: 'Navigate', items: [CHROME.select, CHROME.pan] },
    { label: 'Make', items: [...made, 'image'] },
    { label: 'Annotate', items: [CHROME.comment] },
  ]

  const slot = (spec: ToolSpec) => {
    const picker = spec.declared?.options
    const open = picker !== undefined && openMenu === spec.id
    return (
      <div key={spec.id} className="of-rail__slot">
        <button
          type="button"
          className={`of-tool${tool === spec.id ? ' of-tool--active' : ''}`}
          aria-pressed={tool === spec.id}
          aria-label={spec.label}
          // The tip that shows the key is hidden from assistive tech, so
          // without this the letter keys were never announced.
          aria-keyshortcuts={spec.shortcut}
          data-testid={`tool-${spec.id}`}
          onClick={(event) => {
            /*
             * Pressing an ARMED tool that has options opens them. The second
             * press on Shape used to cycle the kind and on Table open the
             * picker — one gesture, two meanings — and cycling silently
             * changed what the next click would make. U still cycles.
             */
            if (picker !== undefined && tool === spec.id) {
              toggle(spec.id, event.currentTarget)
              return
            }
            setOpenMenu(null)
            setTool(spec.id)
          }}
        >
          {spec.icon}
          <span className="of-tool__tip" aria-hidden="true">
            {spec.label}
            <kbd>{spec.shortcut}</kbd>
          </span>
        </button>

        {picker !== undefined && (
          <button
            type="button"
            className="of-rail__more"
            aria-label={picker.label}
            aria-haspopup={picker.popup}
            aria-expanded={open}
            data-tip={picker.label}
            data-testid={picker.testIds.disclosure}
            onClick={(event) => {
              toggle(spec.id, event.currentTarget)
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
        {picker !== undefined && open && (
          <AnchoredSurface
            anchor={anchor}
            surface={canvasSize}
            prefer={['right', 'left']}
            testId={picker.testIds.surface}
            layer="menu"
          >
            {/* Only there to say what counts as inside, for the dismissal. */}
            <div ref={flyout} className="of-rail__picker">
              <picker.Picker
                options={spec.options}
                choose={(options) => {
                  // Arming the tool as well: choosing a 4x6 table or an
                  // ellipse is saying you are about to place one.
                  setToolOptions(spec.id, options)
                  setTool(spec.id)
                  close(false)
                }}
              />
            </div>
          </AnchoredSurface>
        )}
      </div>
    )
  }

  /*
   * A button rather than a tool mode. Every other tool places something the
   * app can invent; an image needs a file first, so there is nothing to arm.
   */
  const image = (
    <div key="image" className="of-rail__slot">
      <button
        type="button"
        className="of-tool"
        aria-label="Insert image"
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
        // Never focused (tabIndex -1), but it is a form control, and one
        // with no name is an error however it is reached.
        aria-label="Image file"
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
  )

  return (
    <div
      ref={rail}
      className="of-rail"
      role="toolbar"
      aria-label="Board tools"
      aria-orientation="vertical"
    >
      {groups.map((group, index) => (
        <Fragment key={group.label}>
          {index > 0 && <div className="of-rail__rule" role="separator" />}
          <div className="of-rail__group" role="group" aria-label={group.label}>
            {group.items.map((item) => (item === 'image' ? image : slot(item)))}
          </div>
        </Fragment>
      ))}
    </div>
  )
}
