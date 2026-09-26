import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'

import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { DisclosureIcon } from '../controls/icons.js'
import { useViewportSize } from '../controls/use-viewport-size.js'
import { useCommands } from '../hooks/use-commands.js'
import { useOpenFrame } from '../runtime/context.js'
import { useInteractionStore, type ContextMenuAt } from '../interaction/interaction-store.js'
import { ariaKeys, formatKeys } from '../interaction/keymap.js'
import type { Rect } from '../scene/anchoring.js'
import { fitToDocument } from '../scene/zoom.js'

interface Item {
  readonly label: string
  /** Written once, as a chord — `'Mod+Shift+G'` — and shown per platform. */
  readonly shortcut?: string
  readonly run?: () => void
  readonly disabled?: boolean
  /** Destroys what it acts on, and looks it on hover and focus. */
  readonly danger?: boolean
  /** Items that open beside this one instead of running anything. */
  readonly submenu?: readonly Item[]
}

type Group = readonly Item[]

/** The items a keyboard can land on in ONE menu, in order, disabled ones included. */
function itemsIn(menu: HTMLElement | null): HTMLElement[] {
  return menu === null
    ? []
    : [...menu.querySelectorAll<HTMLElement>(':scope > .of-menu__group > [role="menuitem"]')]
}

const testIdOf = (label: string): string =>
  `menu-${label
    .toLowerCase()
    .replace(/ /g, '-')
    .replace(/[^a-z-]/g, '')}`

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
  const subRef = useRef<HTMLDivElement>(null)
  const surface = useViewportSize()
  /*
   * The open submenu, tagged with the menu it was opened in: a menu opened
   * afresh starts with none, without an effect resetting it.
   */
  const [opened, setOpened] = useState<{
    readonly label: string
    readonly at: Rect
    readonly in: ContextMenuAt
  } | null>(null)
  const open = opened !== null && opened.in === at ? opened : null
  const setOpen = (next: { readonly label: string; readonly at: Rect } | null): void => {
    setOpened(next === null || at === null ? null : { ...next, in: at })
  }
  /*
   * Where the keyboard was before the menu opened, so closing hands it back.
   * Without this, Escape left focus on the body — somebody working by keyboard
   * was put back at the top of the page.
   */
  const returnTo = useRef<HTMLElement | null>(null)

  /*
   * A menu anchored to a POINT rather than to a control: a zero-sized
   * rectangle where the pointer was, with no gap, so `below` puts its
   * top-left exactly there — or, from the keyboard, to the selection.
   *
   * It FLIPS above the pointer rather than sliding up, which is `above` as the
   * second preference — sliding would put the menu over the thing you just
   * right-clicked.
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

  /*
   * Tab closes the menu AND moves on, from where the menu was opened — the
   * menu is not a stop in the page's order. Handing focus back and stopping
   * there made leaving it by Tab cost a second press.
   */
  const tabAway = (backward: boolean): void => {
    const inMenu = (element: Element): boolean =>
      ref.current?.contains(element) === true || subRef.current?.contains(element) === true
    const stops = [
      ...document.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => !inMenu(element) && element.getClientRects().length > 0)
    const from = returnTo.current === null ? -1 : stops.indexOf(returnTo.current)
    const next =
      from === -1
        ? backward
          ? stops[stops.length - 1]
          : stops[0]
        : stops[(from + (backward ? -1 : 1) + stops.length) % stops.length]
    close()
    next?.focus()
  }

  useEffect(() => {
    if (at === null) return
    const outside = (event: Event): void => {
      const target = event.target as Node
      if (ref.current?.contains(target) === true || subRef.current?.contains(target) === true)
        return
      close()
    }
    // Capture phase: the canvas would otherwise consume the pointerdown first.
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('blur', close)
    }
  }, [at, close])

  // The submenu takes the keyboard as soon as it is open.
  useEffect(() => {
    if (open === null) return
    itemsIn(subRef.current)[0]?.focus()
  }, [open])

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
   * Only what EVERY selected object can derive or become — the intersection
   * rule the inspector's style properties follow, and for the same reason: one
   * entry must mean one thing, and an entry that acts on three of five objects
   * is a partial action nobody can see the shape of.
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

  /*
   * A point on the board is not an object. Right-clicking empty canvas used to
   * offer the object menu with all fourteen entries switched off — a list of
   * things you cannot do. It now offers what can be done AT a point.
   */
  const boardGroups: Group[] = [
    [
      {
        label: 'Paste here',
        shortcut: 'Mod+V',
        run: () => commands.paste(at.world),
        disabled: clipboardSize === 0,
      },
      {
        label: 'Add a note here',
        run: () => {
          const id = commands.createObject('sticky', at.world)
          if (id === null) return
          const store = useInteractionStore.getState()
          store.setSelection([id])
          store.setEditing(id)
        },
      },
    ],
    [
      { label: 'Select all', shortcut: 'Mod+A', run: () => commands.selectAll() },
      {
        label: 'Zoom to fit',
        shortcut: 'Mod+1',
        run: () => {
          const store = useInteractionStore.getState()
          const next = fitToDocument(
            runtime.store.getDocument(),
            runtime.registry,
            store.canvasSize.width,
            store.canvasSize.height,
          )
          if (next !== null) store.setViewport(next)
        },
      },
    ],
  ]

  const selectionGroups: Group[] = [
    /*
     * FIRST, because they are what this product is for: turning a note into
     * evidence, and standing an insight on it, is the synthesis motion
     * PRODUCT.md is built around. They sat fourth, in a flat list where
     * "Promote to evidence" weighed exactly what "Bring forward" did.
     *
     * Deriving is not promoting: it CREATES something standing on what is
     * selected, rather than turning the selection into it. Which of either
     * exist comes from the registry, so this menu names no type.
     */
    [
      ...derivations.map((derivation) => ({
        label: `Derive ${derivation.type}`,
        run: () => {
          commands.derive(derivation.type, derivation.predicate)
        },
      })),
      ...promotions.map((target) => ({
        // "Promote", not "Convert": the note turns out to have BEEN evidence.
        label: `Promote to ${target}`,
        run: () => {
          commands.promoteSelection(target)
        },
        disabled: locked,
      })),
    ],
    [
      { label: 'Cut', shortcut: 'Mod+X', run: () => commands.cutSelection() },
      { label: 'Copy', shortcut: 'Mod+C', run: () => commands.copySelection() },
      {
        label: 'Paste',
        shortcut: 'Mod+V',
        run: () => commands.paste(),
        disabled: clipboardSize === 0,
      },
      { label: 'Duplicate', shortcut: 'Mod+D', run: () => commands.duplicateSelection() },
    ],
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
      /*
       * Four entries that are one idea — which way in the stack — folded into
       * one. Flat, they were a quarter of the menu's height.
       */
      {
        label: 'Arrange',
        submenu: [
          { label: 'Bring to front', shortcut: 'Shift+]', run: () => commands.reorder('front') },
          { label: 'Bring forward', shortcut: ']', run: () => commands.reorder('forward') },
          { label: 'Send backward', shortcut: '[', run: () => commands.reorder('backward') },
          { label: 'Send to back', shortcut: 'Shift+[', run: () => commands.reorder('back') },
        ],
      },
    ],
    [
      { label: locked ? 'Unlock' : 'Lock', run: () => commands.setLocked(!locked) },
      { label: 'Hide', run: () => commands.setHidden(true) },
    ],
    [
      {
        label: 'Delete',
        shortcut: 'Del',
        run: () => commands.deleteSelection(),
        danger: true,
      },
    ],
  ]

  const groups = hasSelection ? selectionGroups : boardGroups
  const submenu = groups.flat().find((item) => item.label === open?.label)?.submenu

  return (
    <>
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
        <MenuList
          list={ref}
          groups={groups}
          label={hasSelection ? 'Selection' : 'Board'}
          testId="context-menu"
          open={open?.label ?? null}
          onOpen={(label, rect) => setOpen({ label, at: rect })}
          onHover={(label) => {
            if (label !== open?.label) setOpen(null)
          }}
          onRun={dismiss}
          onClose={dismiss}
          onTab={tabAway}
        />
      </AnchoredSurface>
      {open !== null && submenu !== undefined && (
        <AnchoredSurface
          anchor={open.at}
          surface={surface}
          prefer={['right', 'left']}
          gap={2}
          margin={8}
          testId="context-submenu-surface"
          layer="menu"
        >
          <MenuList
            list={subRef}
            groups={[submenu]}
            label={open.label}
            testId="context-submenu"
            open={null}
            onOpen={() => undefined}
            onHover={() => undefined}
            onRun={dismiss}
            onTab={tabAway}
            onClose={() => {
              // Back to the item that opened it, as the menu pattern does.
              const parent = ref.current?.querySelector<HTMLElement>(
                `[data-testid="${testIdOf(open.label)}"]`,
              )
              setOpen(null)
              parent?.focus()
            }}
            closeOnLeft
          />
        </AnchoredSurface>
      )}
    </>
  )
}

/**
 * One menu's worth of items, and its keys.
 *
 * Per the ARIA menu pattern: arrows move and wrap, Home and End jump, a letter
 * jumps to the next item starting with it, Escape and Tab close. EVERY key
 * stops here — the board's keymap listens on the window and reads arrows as
 * nudges and Escape as "clear the selection".
 */
function MenuList({
  list,
  groups,
  label,
  testId,
  open,
  onOpen,
  onHover,
  onRun,
  onClose,
  onTab,
  closeOnLeft = false,
}: {
  readonly list: RefObject<HTMLDivElement | null>
  readonly groups: readonly Group[]
  readonly label: string
  readonly testId: string
  readonly open: string | null
  readonly onOpen: (label: string, at: Rect) => void
  readonly onHover: (label: string) => void
  readonly onRun: () => void
  readonly onClose: () => void
  readonly onTab: (backward: boolean) => void
  readonly closeOnLeft?: boolean
}) {
  const openFrom = (element: HTMLElement, item: Item): void => {
    const box = element.getBoundingClientRect()
    onOpen(item.label, { x: box.x, y: box.y, width: box.width, height: box.height })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation()
    const items = itemsIn(list.current)
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
      case 'ArrowRight': {
        const element = items[current]
        if (element?.getAttribute('aria-haspopup') === 'menu') {
          event.preventDefault()
          element.click()
        }
        return
      }
      case 'ArrowLeft':
        if (closeOnLeft) {
          event.preventDefault()
          onClose()
        }
        return
      case 'Escape':
        event.preventDefault()
        onClose()
        return
      case 'Tab':
        event.preventDefault()
        onTab(event.shiftKey)
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
    <div
      ref={list}
      className="of-menu of-surface"
      role="menu"
      aria-label={label}
      data-testid={testId}
      onKeyDown={onKeyDown}
    >
      {/*
       * Empty groups are dropped, not rendered. A group carries a separator
       * rule, so a selection with nothing to derive or promote would otherwise
       * show a divider with nothing under it.
       */}
      {groups
        .filter((group) => group.length > 0)
        .map((group, index) => (
          <div key={index} className="of-menu__group">
            {group.map((item) => (
              /*
               * Disabled by `aria-disabled`, not `disabled`: a disabled button
               * leaves the focus order, so the arrows skipped it and a screen
               * reader never heard that Paste existed. The menu pattern keeps
               * unavailable items reachable and says so.
               *
               * Named by the label alone. The shortcut was part of the name —
               * "Cut Ctrl+X" — and is `aria-keyshortcuts` instead.
               */
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={`of-menu__item${item.danger === true ? ' of-menu__item--danger' : ''}`}
                aria-disabled={item.disabled === true ? true : undefined}
                aria-haspopup={item.submenu === undefined ? undefined : 'menu'}
                aria-expanded={item.submenu === undefined ? undefined : open === item.label}
                aria-keyshortcuts={
                  item.shortcut === undefined ? undefined : ariaKeys(item.shortcut)
                }
                data-testid={testIdOf(item.label)}
                onPointerEnter={(event) => {
                  onHover(item.label)
                  if (item.submenu !== undefined && item.disabled !== true)
                    openFrom(event.currentTarget, item)
                }}
                onClick={(event) => {
                  if (item.disabled === true) return
                  if (item.submenu !== undefined) {
                    openFrom(event.currentTarget, item)
                    return
                  }
                  item.run?.()
                  onRun()
                }}
              >
                <span>{item.label}</span>
                {item.shortcut !== undefined && (
                  <span className="of-menu__shortcut" aria-hidden="true">
                    {formatKeys(item.shortcut)}
                  </span>
                )}
                {item.submenu !== undefined && <DisclosureIcon className="of-menu__more" />}
              </button>
            ))}
          </div>
        ))}
    </div>
  )
}
