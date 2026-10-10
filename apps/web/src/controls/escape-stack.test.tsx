import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useEscapeToClose } from './escape-stack.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** A surface that stays open until Escape closes it, and says so. */
function Surface({ name, closed }: { name: string; closed: string[] }) {
  const [open, setOpen] = useState(true)
  useEscapeToClose(() => {
    closed.push(name)
    setOpen(false)
  }, open)
  return open ? <div data-surface={name} /> : null
}

let host: HTMLElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  host.remove()
})

function escape(on: EventTarget = document.body): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  act(() => {
    on.dispatchEvent(event)
  })
  return event
}

describe('the Escape stack', () => {
  it('closes the surface opened last, one per press', () => {
    const closed: string[] = []
    act(() => {
      root.render(
        <>
          <Surface name="sheet" closed={closed} />
          <Surface name="menu" closed={closed} />
        </>,
      )
    })
    escape()
    expect(closed).toEqual(['menu'])
    escape()
    expect(closed).toEqual(['menu', 'sheet'])
  })

  it('takes the press from everything else, the board and the focused element included', () => {
    const closed: string[] = []
    act(() => {
      root.render(<Surface name="sheet" closed={closed} />)
    })
    const field = document.createElement('input')
    host.append(field)
    let reached = false
    field.addEventListener('keydown', () => {
      reached = true
    })
    const event = escape(field)
    expect(closed).toEqual(['sheet'])
    expect(reached).toBe(false)
    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves Escape alone with nothing open', () => {
    const event = escape()
    expect(event.defaultPrevented).toBe(false)
  })
})
