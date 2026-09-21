import { useEffect, useLayoutEffect, useRef, useState } from 'react'

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

  /*
   * Where the menu actually fits, which is not always where you clicked.
   *
   * It was placed at the pointer and never clamped, so a right-click near the
   * bottom of the window put its lower entries off-screen — unreachable, and
   * silent about it. That was true at every size; making the rows a real
   * target is simply what made it reachable in a test, which then sat there
   * timing out for thirty seconds on an item nobody could have clicked either.
   *
   * It FLIPS above the pointer rather than sliding up, because sliding puts
   * the menu over the thing you just right-clicked.
   */
  const [placed, setPlaced] = useState<{ readonly left: number; readonly top: number } | null>(null)

  useLayoutEffect(() => {
    const node = ref.current
    if (node === null || at === null) {
      setPlaced(null)
      return
    }

    const margin = 8
    const { width, height } = node.getBoundingClientRect()
    const left = Math.max(margin, Math.min(at.x, window.innerWidth - width - margin))
    const fitsBelow = at.y + height + margin <= window.innerHeight
    const top = fitsBelow ? at.y : Math.max(margin, at.y - height)

    setPlaced({ left, top })
  }, [at])

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
  const selected = [...useInteractionStore.getState().selection]
  const locked = selected.some((id) => runtime.store.getObject(id)?.locked === true)
  // Asked of the registry rather than compared against 'group', so this stays
  // correct for any later type that selects as a unit.
  const hasGroup = selected.some((id) => {
    const type = runtime.store.getObject(id)?.type
    return type !== undefined && runtime.registry.get(type)?.capabilities.selectsAsUnit === true
  })

  /*
   * Promotions come from the REGISTRY, so this menu names no type. A selection
   * is offered only what EVERY member can become — the same intersection rule
   * as the inspector's style properties, and for the same reason: one entry
   * must mean one thing, and an entry that promotes three of five objects is a
   * partial action the user cannot see the shape of.
   */
  /*
   * Only what EVERY selected object can derive, the same intersection rule as
   * promotions and style properties: one entry must mean one thing, and an
   * entry that relates three of five objects is a partial action nobody can see
   * the shape of.
   */
  const derivations = selected
    .map((id) => {
      const type = runtime.store.getObject(id)?.type
      return type === undefined ? [] : (runtime.registry.get(type)?.derivations ?? [])
    })
    .reduce<readonly { type: string; predicate: string }[]>(
      (common, list, index) =>
        index === 0 ? [...list] : common.filter((d) => list.some((o) => o.type === d.type)),
      [],
    )

  const promotions = selected
    .map((id) => {
      const type = runtime.store.getObject(id)?.type
      return type === undefined ? [] : (runtime.registry.get(type)?.promotions ?? [])
    })
    .reduce<readonly string[]>(
      (common, list, index) =>
        index === 0 ? list : common.filter((target) => list.includes(target)),
      [],
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
    /*
     * Deriving is not promoting: it CREATES something standing on what is
     * selected, rather than turning the selection into it. Conflating the two
     * would mean the evidence disappeared at the moment it started being cited.
     *
     * Which derivations exist comes from the registry, so this menu names no
     * type — and the next one is reachable by declaring itself.
     */
    derivations.map((derivation) => ({
      label: `Derive ${derivation.type}`,
      run: () => {
        commands.derive(derivation.type, derivation.predicate)
      },
      disabled: !hasSelection,
    })),
    promotions.map((target) => ({
      /*
       * "Promote to evidence", not "Convert to evidence": the user is saying
       * what the note turns out to have been, which is the vocabulary
       * PRODUCT.md uses for the whole synthesis motion.
       */
      label: `Promote to ${target}`,
      run: () => {
        commands.promoteSelection(target)
      },
      disabled: !hasSelection || locked,
    })),
    [
      {
        label: 'Group',
        shortcut: `${mod}G`,
        run: () => commands.group(),
        // One object is already a unit; grouping it would add a container with
        // nothing to contain.
        disabled: selectionSize < 2,
      },
      {
        label: 'Ungroup',
        shortcut: `${mod}⇧G`,
        run: () => commands.ungroup(),
        disabled: !hasGroup,
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
      className="of-menu of-surface"
      role="menu"
      data-testid="context-menu"
      style={{
        left: `${String(placed?.left ?? at.x)}px`,
        top: `${String(placed?.top ?? at.y)}px`,
        /* Hidden for the one frame before it has been measured: a menu that
           appears at the pointer and then jumps reads as a glitch. */
        visibility: placed === null ? 'hidden' : 'visible',
      }}
    >
      {/*
       * Empty groups are dropped, not rendered. A group carries a separator
       * rule, so a selection with no promotions on offer would otherwise show
       * a divider with nothing under it.
       */}
      {groups
        .filter((group) => group.length > 0)
        .map((group, index) => (
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
