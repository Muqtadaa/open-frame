import { afterEach, describe, expect, it } from 'vitest'

import { stepFocus, targetIndex, type KeyPress, type RovingOptions } from './roving.js'

/** A list of buttons named by `labels`, in the page so focus can land on them. */
function list(labels: readonly string[]): HTMLElement {
  const host = document.createElement('div')
  for (const label of labels) {
    const button = document.createElement('button')
    button.textContent = label
    button.setAttribute('role', 'menuitem')
    host.append(button)
  }
  document.body.append(host)
  return host
}

afterEach(() => {
  document.body.replaceChildren()
})

function press(
  host: HTMLElement,
  key: string,
  options: Omit<RovingOptions, 'items'> = {},
  modifiers: Partial<Pick<KeyPress, 'shiftKey' | 'metaKey' | 'ctrlKey' | 'altKey'>> = {},
) {
  const taken = { prevented: false, stopped: false }
  const event: KeyPress = {
    key,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    ...modifiers,
    currentTarget: host,
    preventDefault: () => {
      taken.prevented = true
    },
    stopPropagation: () => {
      taken.stopped = true
    },
  }
  const moved = stepFocus(event, { items: '[role="menuitem"]', ...options })
  return { moved, taken, focused: document.activeElement?.textContent }
}

function focus(host: HTMLElement, index: number): void {
  host.querySelectorAll<HTMLElement>('button')[index]?.focus()
}

describe('targetIndex', () => {
  it('wraps past either end, or stops there', () => {
    expect(targetIndex('ArrowDown', 2, 3)).toBe(0)
    expect(targetIndex('ArrowUp', 0, 3)).toBe(2)
    expect(targetIndex('ArrowDown', 2, 3, { wrap: false })).toBe(2)
    expect(targetIndex('ArrowUp', 0, 3, { wrap: false })).toBe(0)
  })

  it('enters from nowhere at the end it walks from', () => {
    expect(targetIndex('ArrowDown', -1, 3)).toBe(0)
    expect(targetIndex('ArrowUp', -1, 3)).toBe(2)
  })

  it('answers only the arrows of its orientation', () => {
    expect(targetIndex('ArrowRight', 0, 3)).toBeNull()
    expect(targetIndex('ArrowDown', 0, 3, { orientation: 'horizontal' })).toBeNull()
    expect(targetIndex('ArrowRight', 0, 3, { orientation: 'horizontal' })).toBe(1)
    expect(targetIndex('ArrowLeft', 1, 3, { orientation: 'both' })).toBe(0)
    expect(targetIndex('ArrowDown', 1, 3, { orientation: 'both' })).toBe(2)
  })

  it('goes to either end on Home and End, unless asked not to', () => {
    expect(targetIndex('Home', 2, 3)).toBe(0)
    expect(targetIndex('End', 0, 3)).toBe(2)
    expect(targetIndex('Home', 2, 3, { homeEnd: false })).toBeNull()
  })

  it('has nowhere to go in an empty list', () => {
    expect(targetIndex('ArrowDown', -1, 0)).toBeNull()
  })
})

describe('stepFocus', () => {
  it('moves focus, and takes the press from the board', () => {
    const host = list(['Copy', 'Paste', 'Delete'])
    focus(host, 0)
    const { moved, taken, focused } = press(host, 'ArrowDown')
    expect(focused).toBe('Paste')
    expect(moved?.index).toBe(1)
    expect(taken).toEqual({ prevented: true, stopped: true })
  })

  /*
   * A key the list does not use goes on: Enter must still press the item,
   * and Escape must still reach the stack.
   */
  it('leaves a key it does not use alone', () => {
    const host = list(['Copy', 'Paste'])
    focus(host, 0)
    const { moved, taken, focused } = press(host, 'Enter')
    expect(moved).toBeNull()
    expect(taken).toEqual({ prevented: false, stopped: false })
    expect(focused).toBe('Copy')
  })

  it('goes to the next item beginning with a letter, wrapping, when asked to', () => {
    const host = list(['Copy', 'Paste', 'Print', 'Delete'])
    focus(host, 1)
    expect(press(host, 'p', { typeahead: true }).focused).toBe('Print')
    expect(press(host, 'p', { typeahead: true }).focused).toBe('Paste')
    expect(press(host, 'P', { typeahead: true }).focused).toBe('Print')
    // Not without being asked, and never with a modifier held.
    expect(press(host, 'c').moved).toBeNull()
    expect(press(host, 'c', { typeahead: true }, { metaKey: true }).moved).toBeNull()
  })

  it('takes Tab and says which way, when Tab closes the list', () => {
    const host = list(['Copy', 'Paste'])
    focus(host, 0)
    const ways: boolean[] = []
    const onTab = (backward: boolean) => {
      ways.push(backward)
    }
    const forward = press(host, 'Tab', { onTab })
    press(host, 'Tab', { onTab }, { shiftKey: true })
    expect(ways).toEqual([false, true])
    expect(forward.taken.prevented).toBe(true)
    // A list that is not closed by Tab lets it walk on.
    expect(press(host, 'Tab').taken.prevented).toBe(false)
  })

  it('walks only the items it is given', () => {
    const host = list(['Copy', 'Paste'])
    const heading = document.createElement('button')
    heading.textContent = 'Heading'
    host.prepend(heading)
    focus(host, 2)
    expect(press(host, 'ArrowDown').focused).toBe('Copy')
  })
})
