import { afterEach, describe, expect, it } from 'vitest'

import {
  EDITOR_CHROME,
  claimsDoubleClick,
  handleUnderPointer,
  isTextEntry,
  objectChromeUnderPointer,
} from './targets.js'

/**
 * What a press landed on, read from the DOM before any gesture starts.
 *
 * Each of these is a bug that was found in a browser: a press on the format
 * bar read as a board gesture and ended the edit it was formatting, a drawn
 * icon (an SVGElement, not an HTMLElement) slipped past the chrome check, and
 * a connector's midpoint swallowed the double-click that labels the line.
 */
afterEach(() => {
  document.body.replaceChildren()
})

function inside(parent: Element, tag = 'span'): Element {
  const child = document.createElement(tag)
  parent.append(child)
  document.body.append(parent)
  return child
}

describe('a press that belongs to a text control', () => {
  it('is any field or editable text', () => {
    expect(isTextEntry(document.createElement('textarea'))).toBe(true)
    expect(isTextEntry(document.createElement('input'))).toBe(true)
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    document.body.append(editable)
    // jsdom does not compute isContentEditable; a browser does.
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    expect(isTextEntry(editable)).toBe(true)
  })

  it('includes the chrome of an open editor, even a drawn icon inside it', () => {
    const bar = document.createElement('div')
    bar.className = EDITOR_CHROME.slice(1)
    const icon = inside(bar, 'b')
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    icon.append(svg)
    expect(isTextEntry(svg)).toBe(true)
  })

  it('is not the board', () => {
    expect(isTextEntry(inside(document.createElement('div')))).toBe(false)
    expect(isTextEntry(null)).toBe(false)
  })
})

describe('the handle under a press', () => {
  it('is found from anything drawn inside it', () => {
    const handle = document.createElement('div')
    handle.dataset.handle = 'se'
    expect(handleUnderPointer(inside(handle))).toBe('se')
    expect(handleUnderPointer(document.body)).toBeNull()
  })

  it('claims a double-click unless it is only something to drag', () => {
    expect(claimsDoubleClick('divider')).toBe(true)
    expect(claimsDoubleClick('endpoint')).toBe(false)
    expect(claimsDoubleClick(null)).toBe(false)
  })
})

describe('chrome drawn outside an object’s bounds', () => {
  it('names the object it belongs to (rule 15)', () => {
    const object = document.createElement('div')
    object.dataset.objectId = 'obj_frame'
    expect(objectChromeUnderPointer(inside(object))).toBe('obj_frame')
    expect(objectChromeUnderPointer(document.body)).toBeNull()
  })
})
