import { asObjectId } from '@openframe/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useInteractionStore } from '../interaction/interaction-store.js'
import { mountOnBoard, type Mounted } from '../test-render.js'
import { ContextMenu } from './ContextMenu.js'

/**
 * The right-click menu from the keyboard (the ARIA menu pattern): focus goes in
 * when it opens, arrows move and wrap, Home and End jump, a letter jumps to the
 * next item that starts with it, an unavailable item can be reached and says
 * so, Escape hands focus back to where it came from, and no key leaks to the
 * board's own shortcuts on the way.
 */
let ui: Mounted
let opener: HTMLButtonElement

beforeEach(async () => {
  useInteractionStore.setState({ contextMenu: null, selection: new Set(), clipboard: [] })
  ui = await mountOnBoard(<ContextMenu />)
  opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
})

afterEach(() => {
  ui.unmount()
  opener.remove()
})

function openMenu(): HTMLElement {
  ui.act(() => {
    useInteractionStore.getState().openContextMenu({
      x: 100,
      y: 100,
      width: 0,
      height: 0,
      via: 'keyboard',
      world: { x: 100, y: 100 },
    })
  })
  const menu = document.querySelector<HTMLElement>('[role="menu"]')
  if (menu === null) throw new Error('no menu')
  return menu
}

/** Where the keyboard is, or a failure saying it is nowhere. */
function focused(): Element {
  const element = document.activeElement
  if (element === null) throw new Error('nothing has focus')
  return element
}

const focusedLabel = (): string | undefined =>
  (document.activeElement as HTMLElement | null)?.querySelector('span')?.textContent ?? undefined

const items = (menu: HTMLElement): HTMLElement[] => [
  ...menu.querySelectorAll<HTMLElement>('[role="menuitem"]'),
]

describe('the board’s menu, from the keyboard', () => {
  it('takes focus to its first item that can be used', () => {
    const menu = openMenu()
    const first = items(menu)[0]
    // Paste with nothing to paste comes first and is unavailable.
    expect(first?.getAttribute('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(items(menu)[1])
  })

  it('moves with the arrows, wraps at both ends, and jumps with Home and End', () => {
    const menu = openMenu()
    const all = items(menu)
    ui.press(focused(), 'Home')
    expect(document.activeElement).toBe(all[0])
    ui.press(focused(), 'ArrowUp')
    expect(document.activeElement).toBe(all.at(-1))
    ui.press(focused(), 'ArrowDown')
    expect(document.activeElement).toBe(all[0])
    ui.press(focused(), 'End')
    expect(document.activeElement).toBe(all.at(-1))
  })

  it('keeps an unavailable item reachable, and does nothing when it is chosen', () => {
    const menu = openMenu()
    ui.press(focused(), 'Home')
    const paste = document.activeElement as HTMLElement
    expect(paste.getAttribute('aria-disabled')).toBe('true')
    ui.act(() => {
      paste.click()
    })
    expect(menu.isConnected).toBe(true)
  })

  it('jumps to the next item starting with a typed letter', () => {
    openMenu()
    ui.press(focused(), 's')
    expect(focusedLabel()).toBe('Select all')
  })

  it('closes on Escape and hands focus back to where it was', () => {
    openMenu()
    ui.press(focused(), 'Escape')
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('runs an item, closes, and leaves the board changed', () => {
    openMenu()
    ui.press(focused(), 'Home')
    ui.press(focused(), 'ArrowDown')
    expect(focusedLabel()).toBe('Add a note here')
    ui.act(() => {
      ;(document.activeElement as HTMLElement).click()
    })
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(ui.runtime.store.getDocument().objects.size).toBe(1)
  })

  it('keeps every key to itself, so arrows do not also nudge the selection', () => {
    openMenu()
    let leaked = 0
    const count = () => {
      leaked += 1
    }
    window.addEventListener('keydown', count)
    ui.press(focused(), 'ArrowDown')
    ui.press(focused(), 'x')
    window.removeEventListener('keydown', count)
    expect(leaked).toBe(0)
  })
})

describe('a submenu, from the keyboard', () => {
  it('opens with ArrowRight on its item, takes the keyboard, and gives it back on ArrowLeft', () => {
    const note = asObjectId('obj_note')
    const made = ui.runtime.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ id: note, type: 'sticky', x: 0, y: 0 }],
    })
    if (!made.ok) throw made.error
    ui.act(() => {
      useInteractionStore.getState().setSelection([note])
    })
    const menu = openMenu()
    const promote = items(menu).find((item) => item.textContent?.startsWith('Promote to'))
    if (promote === undefined) throw new Error('a sticky offers no promotion')
    ui.act(() => {
      promote.focus()
    })

    ui.press(promote, 'ArrowRight')
    expect(promote.getAttribute('aria-expanded')).toBe('true')
    const submenu = document.querySelectorAll('[role="menu"]')[1]
    expect(submenu?.contains(document.activeElement)).toBe(true)

    ui.press(focused(), 'ArrowLeft')
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1)
    expect(document.activeElement).toBe(promote)
  })
})
