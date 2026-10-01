import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useInteractionStore } from '../interaction/interaction-store.js'
import { mountOnBoard, type Mounted } from '../test-render.js'
import { ZoomControl } from './ZoomControl.js'

/**
 * The typed zoom: a readout that opens a field, which takes a percentage on
 * Enter, refuses one it cannot take where it was typed, and puts the keyboard
 * back on the readout either way it closes.
 */
let ui: Mounted

beforeEach(async () => {
  useInteractionStore.setState({
    viewport: { x: 0, y: 0, zoom: 1 },
    canvasSize: { width: 1000, height: 800 },
  })
  ui = await mountOnBoard(<ZoomControl />)
})

afterEach(() => {
  ui.unmount()
})

const get = (testId: string): HTMLElement => {
  const element = ui.container.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
  if (element === null) throw new Error(`no ${testId}`)
  return element
}

function open(): HTMLInputElement {
  ui.act(() => {
    get('zoom-percent').click()
  })
  const field = get('zoom-input') as HTMLInputElement
  // A browser's `select()` focuses the field; jsdom's only selects. The test
  // stands in for the browser so the keys below land where a person's would.
  field.focus()
  return field
}

describe('typing a zoom', () => {
  it('opens on the current zoom, selected, so typing replaces it', () => {
    const field = open()
    expect(field.value).toBe('100')
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 3])
  })

  it('takes the zoom on Enter and hands the keyboard back to the readout', () => {
    const field = open()
    ui.type(field, '250%')
    const enter = ui.press(field, 'Enter')

    expect(useInteractionStore.getState().viewport.zoom).toBe(2.5)
    expect(document.activeElement).toBe(get('zoom-percent'))
    // Prevented, or the Enter would press the readout it lands on and open
    // the field again.
    expect(enter.defaultPrevented).toBe(true)
  })

  it('keeps the field open beside the reason when the zoom cannot be taken', () => {
    const field = open()
    ui.type(field, '2')
    ui.press(field, 'Enter')

    expect(useInteractionStore.getState().viewport.zoom).toBe(1)
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Zoom is 5–1600%')
    expect(document.activeElement).toBe(field)
  })

  it('clears the reason as soon as the person types again', () => {
    const field = open()
    ui.type(field, 'big')
    ui.press(field, 'Enter')
    ui.type(field, '150')
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it('puts everything back on Escape', () => {
    const field = open()
    ui.type(field, '300')
    ui.press(field, 'Escape')

    expect(useInteractionStore.getState().viewport.zoom).toBe(1)
    expect(ui.container.querySelector('[data-testid="zoom-input"]')).toBeNull()
    expect(document.activeElement).toBe(get('zoom-percent'))
  })

  it('does not trap the next click behind a zoom it could not take', () => {
    const field = open()
    ui.type(field, 'big')
    ui.act(() => {
      field.blur()
    })
    expect(ui.container.querySelector('[data-testid="zoom-input"]')).toBeNull()
    expect(useInteractionStore.getState().viewport.zoom).toBe(1)
  })

  it('keeps its keys to itself, so the board’s shortcuts do not also fire', () => {
    const field = open()
    let reached = false
    const listener = () => {
      reached = true
    }
    document.addEventListener('keydown', listener)
    ui.press(field, 'v')
    document.removeEventListener('keydown', listener)
    expect(reached).toBe(false)
  })
})
