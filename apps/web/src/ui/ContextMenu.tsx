import { useEffect, useRef, type KeyboardEvent } from 'react'

import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { useViewportSize } from '../controls/use-viewport-size.js'
import { useCommands } from '../hooks/use-commands.js'
import { useOpenFrame } from '../runtime/context.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { ariaKeys, formatKeys } from '../interaction/keymap.js'

interface Item {
  readonly label: string
  /** Written once, as a chord — `'Mod+Shift+G'` — and shown per platform. */
  readonly shortcut?: string
  readonly run: () => void
  readonly disabled?: boolean
}

/** The items a keyboard can land on, in order. Disabled ones included (see below). */
function itemsIn(menu: HTMLElement | null): HTMLElement[] {
  return menu === null ? [] : [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')]
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
  const surface = useViewportSize()
  /*
   * Where the keyboard was before the menu opened, so closing hands it back.
   * Without this, Escape left focus on the body — somebody working by keyboard
   * was put back at the top of the page.
   */
  const returnTo = useRef<HTMLElement | null>(null)

  /*
   * A menu anchored to a POINT rather than to a control: a zero-sized
   * rectangle where the pointer was, with no gap, so `below` puts its
   * top-left exactly there.
   *
   * It FLIPS above the pointer rather than sliding up, which is `above` as the
   * second preference — sliding would put the menu over the thing you just
   * right-clicked.
   *
   * This was a third hand-rolled clamp, after the record panel's and the
   * mentions list's: `Math.max(margin, Math.min(at.x, innerWidth - width -
   * margin))`, measured in a layout effect, with its own margin constant. It
   * was written because a right-click near the bottom of the window put the
   * menu's lower entries off-screen — unreachable, and silent about it.
   */
  const anchor = at === null ? null : { x: at.x, y: at.y, width: at.width, height: at.height }

  /*
   * Focus goes IN when the menu opens. It stayed wherever it was, so arrow
   * keys nudged the object underneath rather than moving through the items,
   * and a screen reader was never told a menu had appeared.
   */
  useEffect(() => {
    if (at === null) return
    const active = document.activeElement
    returnTo.current = active instanceof HTMLElement && active !== document.body ? active : null
    const items = itemsIn(ref.current)
    ;(items.find((item) => item.getAttribute('aria-disabled') !== 'true') ?? items[0])?.focus()
  }, [at])

  const dismiss = (): void => {
    close()
    returnTo.current?.focus()
  }

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
        shortcut: 'Mod+X',
        run: () => commands.cutSelection(),
        disabled: !hasSelection,
      },
      {
        label: 'Copy',
        shortcut: 'Mod+C',
        run: () => commands.copySelection(),
        disabled: !hasSelection,
      },
      {
        label: 'Paste',
        shortcut: 'Mod+V',
        run: () => commands.paste(),
        disabled: clipboardSize === 0,
      },
      {
        label: 'Duplicate',
        shortcut: 'Mod+D',
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
        shortcut: 'Mod+G',
        run: () => commands.group(),
        // One object is already a unit; grouping it would add a container with
        // nothing to contain.
        disabled: selectionSize < 2,
      },
      {
        label: 'Ungroup',
        shortcut: 'Mod+Shift+G',
        run: () => commands.ungroup(),
        disabled: !hasGroup,
      },
    ],
    [
      {
        label: 'Bring to front',
        shortcut: 'Shift+]',
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
        shortcut: 'Shift+[',
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

  /*
   * A menu's keys, per the ARIA menu pattern: arrows move and wrap, Home and
   * End jump, a letter jumps to the next item starting with it, Escape and
   * Tab close. EVERY key stops here — the board's keymap listens on the
   * window and reads arrows as nudges and Escape as "clear the selection".
   */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation()
    const items = itemsIn(ref.current)
    const current = items.indexOf(document.activeElement as HTMLElement)
    const go = (index: number): void => {
      event.preventDefault()
      items[(index + items.length) % items.length]?.focus()
    }
    switch (event.key) {
      case 'ArrowDown':
        go(current + 1)
        return
      case 'ArrowUp':
        go(current < 0 ? items.length - 1 : current - 1)
        return
      case 'Home':
        go(0)
        return
      case 'End':
        go(items.length - 1)
        return
      case 'Escape':
      case 'Tab':
        event.preventDefault()
        dismiss()
        return
    }
    if (event.key.length === 1 && /\S/.test(event.key) && !event.metaKey && !event.ctrlKey) {
      const letter = event.key.toLowerCase()
      for (let step = 1; step <= items.length; step++) {
        const index = (current + step) % items.length
        if (items[index]?.textContent?.trim().toLowerCase().startsWith(letter) === true) {
          go(index)
          return
        }
      }
    }
  }

  return (
    <AnchoredSurface
      anchor={anchor}
      surface={surface}
      // Beside, when a menu hung from a selection fits neither under it nor
      // over it — never on top of the thing it is about.
      prefer={['below', 'above', 'right', 'left']}
      gap={0}
      margin={8}
      testId="context-menu-surface"
      layer="menu"
    >
      <div
        ref={ref}
        className="of-menu of-surface"
        role="menu"
        aria-label={hasSelection ? 'Selection' : 'Board'}
        data-testid="context-menu"
        onKeyDown={onKeyDown}
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
                /*
                 * Disabled by `aria-disabled`, not `disabled`: a disabled
                 * button leaves the focus order, so the arrows skipped it and
                 * a screen reader never heard that Paste existed. The menu
                 * pattern keeps unavailable items reachable and says so.
                 *
                 * Named by the label alone. The shortcut was part of the
                 * name — "Cut Ctrl+X" — and is `aria-keyshortcuts` instead.
                 */
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className="of-menu__item"
                  aria-disabled={item.disabled === true ? true : undefined}
                  aria-keyshortcuts={
                    item.shortcut === undefined ? undefined : ariaKeys(item.shortcut)
                  }
                  data-testid={`menu-${item.label.toLowerCase().replace(/ /g, '-')}`}
                  onClick={() => {
                    if (item.disabled === true) return
                    item.run()
                    dismiss()
                  }}
                >
                  <span>{item.label}</span>
                  {item.shortcut !== undefined && (
                    <span className="of-menu__shortcut" aria-hidden="true">
                      {formatKeys(item.shortcut)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
      </div>
    </AnchoredSurface>
  )
}
