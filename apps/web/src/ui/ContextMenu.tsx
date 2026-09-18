import { useEffect, useRef } from 'react'

import { useCommands } from '../hooks/use-commands.js'
import { useOpenFrame } from '../runtime/context.js'
import { useInteractionStore } from '../interaction/interaction-store.js'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl'

interface Item {
  readonly label: string
  readonly shortcut?: string
  readonly run: () => void
  readonly disabled?: boolean
}

/**
 * Right-click menu.
 *
 * Every entry dispatches through the same command layer as the toolbar and the
 * keyboard — there is no third path into the document.
 */
export function ContextMenu() {
  const at = useInteractionStore((state) => state.contextMenu)
  const close = useInteractionStore((state) => state.closeContextMenu)
  const selectionSize = useInteractionStore((state) => state.selection.size)
  const clipboardSize = useInteractionStore((state) => state.clipboard.length)
  const commands = useCommands()
  const { runtime } = useOpenFrame()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (at === null) return
    const dismiss = (event: Event): void => {
      if (ref.current?.contains(event.target as Node) === true) return
      close()
    }
    // Capture phase: the canvas would otherwise consume the pointerdown first.
    window.addEventListener('pointerdown', dismiss, true)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', dismiss, true)
      window.removeEventListener('blur', close)
    }
  }, [at, close])

  if (at === null) return null

  const hasSelection = selectionSize > 0
  const locked = [...useInteractionStore.getState().selection].some(
    (id) => runtime.store.getObject(id)?.locked === true,
  )

  const groups: Item[][] = [
    [
      {
        label: 'Cut',
        shortcut: `${mod}X`,
        run: () => commands.cutSelection(),
        disabled: !hasSelection,
      },
      {
        label: 'Copy',
        shortcut: `${mod}C`,
        run: () => commands.copySelection(),
        disabled: !hasSelection,
      },
      {
        label: 'Paste',
        shortcut: `${mod}V`,
        run: () => commands.paste(),
        disabled: clipboardSize === 0,
      },
      {
        label: 'Duplicate',
        shortcut: `${mod}D`,
        run: () => commands.duplicateSelection(),
        disabled: !hasSelection,
      },
    ],
    [
      {
        label: 'Bring to front',
        shortcut: '⇧]',
        run: () => commands.reorder('front'),
        disabled: !hasSelection,
      },
      {
        label: 'Bring forward',
        shortcut: ']',
        run: () => commands.reorder('forward'),
        disabled: !hasSelection,
      },
      {
        label: 'Send backward',
        shortcut: '[',
        run: () => commands.reorder('backward'),
        disabled: !hasSelection,
      },
      {
        label: 'Send to back',
        shortcut: '⇧[',
        run: () => commands.reorder('back'),
        disabled: !hasSelection,
      },
    ],
    [
      {
        label: locked ? 'Unlock' : 'Lock',
        run: () => commands.setLocked(!locked),
        disabled: !hasSelection,
      },
      { label: 'Hide', run: () => commands.setHidden(true), disabled: !hasSelection },
      {
        label: 'Delete',
        shortcut: 'Del',
        run: () => commands.deleteSelection(),
        disabled: !hasSelection,
      },
    ],
  ]

  return (
    <div
      ref={ref}
      className="of-menu"
      role="menu"
      data-testid="context-menu"
      style={{ left: `${String(at.x)}px`, top: `${String(at.y)}px` }}
    >
      {groups.map((group, index) => (
        <div key={index} className="of-menu__group">
          {group.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="of-menu__item"
              disabled={item.disabled === true}
              data-testid={`menu-${item.label.toLowerCase().replace(/ /g, '-')}`}
              onClick={() => {
                item.run()
                close()
              }}
            >
              <span>{item.label}</span>
              {item.shortcut !== undefined && (
                <span className="of-menu__shortcut">{item.shortcut}</span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
