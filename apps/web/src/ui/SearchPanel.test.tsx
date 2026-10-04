import { asObjectId, richFromPlain } from '@openframe/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useInteractionStore } from '../interaction/interaction-store.js'
import { mountOnBoard, type Mounted } from '../test-render.js'
import { SearchPanel } from './SearchPanel.js'

/**
 * Find on board, as a combobox: the keyboard never leaves the box, the arrows
 * move which result is ACTIVE (and say so through `aria-activedescendant`),
 * Enter goes to it, and both ways of closing put the keyboard back where it
 * was. A press anywhere else closes it too.
 */
let ui: Mounted
let opener: HTMLButtonElement

beforeEach(async () => {
  useInteractionStore.setState({ searchOpen: false, selection: new Set() })
  ui = await mountOnBoard(<SearchPanel />)
  const made = ui.runtime.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: ['Pricing page', 'Pricing call notes', 'Onboarding'].map((text, index) => ({
      id: asObjectId(`obj_note_${String(index)}`),
      type: 'sticky',
      x: index * 300,
      y: 0,
      data: { text: richFromPlain(text) },
    })),
  })
  if (!made.ok) throw made.error
  opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
})

afterEach(() => {
  ui.unmount()
  opener.remove()
})

function openAndType(query: string): HTMLInputElement {
  ui.act(() => {
    useInteractionStore.getState().setSearchOpen(true)
  })
  const box = document.querySelector<HTMLInputElement>('[data-testid="search-input"]')
  if (box === null) throw new Error('no search box')
  ui.type(box, query)
  return box
}

/** The results in the order the list shows them, by test id. */
const listed = (): string[] =>
  [...document.querySelectorAll<HTMLElement>('[role="option"]')].map(
    (option) => option.dataset.testid ?? '',
  )

const activeOption = (box: HTMLInputElement): string | null => {
  const id = box.getAttribute('aria-activedescendant')
  return id === null ? null : (document.getElementById(id)?.dataset.testid ?? null)
}

describe('finding on the board', () => {
  it('takes the keyboard into the box when it opens', () => {
    const box = openAndType('')
    expect(document.activeElement).toBe(box)
  })

  it('counts what it found, and says when it found nothing', () => {
    openAndType('pricing')
    expect(document.querySelector('[data-testid="search-count"]')?.textContent).toBe('2 found')
    openAndType('zebra')
    expect(document.querySelector('[data-testid="search-count"]')?.textContent).toBe(
      'nothing found',
    )
  })

  it('moves the active result with the arrows, without leaving the box, and stops at the ends', () => {
    const box = openAndType('pricing')
    const [first, second] = listed()
    expect(activeOption(box)).toBe(first)
    ui.press(box, 'ArrowDown')
    expect(activeOption(box)).toBe(second)
    ui.press(box, 'ArrowDown')
    expect(activeOption(box)).toBe(second)
    ui.press(box, 'ArrowUp')
    ui.press(box, 'ArrowUp')
    expect(activeOption(box)).toBe(first)
    expect(document.activeElement).toBe(box)
  })

  it('goes to the active result on Enter: selects it, closes, and hands the keyboard back', () => {
    const box = openAndType('pricing')
    const second = listed()[1]
    ui.press(box, 'ArrowDown')
    ui.press(box, 'Enter')

    expect(
      [...useInteractionStore.getState().selection].map((id) => `search-result-${id}`),
    ).toEqual([second])
    expect(useInteractionStore.getState().searchOpen).toBe(false)
    expect(document.activeElement).toBe(opener)
  })

  it('closes on Escape, forgets the query, and hands the keyboard back', () => {
    const box = openAndType('pricing')
    ui.press(box, 'Escape')
    expect(useInteractionStore.getState().searchOpen).toBe(false)
    expect(document.activeElement).toBe(opener)
    // Reopened WITHOUT typing: typing '' would clear the box whatever close did.
    ui.act(() => {
      useInteractionStore.getState().setSearchOpen(true)
    })
    expect(document.querySelector<HTMLInputElement>('[data-testid="search-input"]')?.value).toBe('')
  })

  it('closes when the board is pressed somewhere else', () => {
    openAndType('pricing')
    ui.act(() => {
      opener.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    })
    expect(useInteractionStore.getState().searchOpen).toBe(false)
  })

  it('keeps typing to itself, so a letter is not also a tool shortcut', () => {
    const box = openAndType('')
    let leaked = false
    const listener = () => {
      leaked = true
    }
    window.addEventListener('keydown', listener)
    ui.press(box, 's')
    window.removeEventListener('keydown', listener)
    expect(leaked).toBe(false)
  })
})
