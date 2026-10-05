import { describe, expect, it } from 'vitest'

import { expectPaste, pasteArrived } from './clipboard-keys.js'

/**
 * Shift+Mod+V and Mod+V fire the same `paste` event, so the key is what says
 * the words were wanted alone. Chromium also strips the formatting itself;
 * this is what holds in a browser that does not.
 */
describe('a paste the key asked for', () => {
  it('is plain when Shift+Mod+V asked for it, once', () => {
    expectPaste(() => undefined, true)
    expect(pasteArrived()).toBe(true)
    expect(pasteArrived()).toBe(false)
  })

  it('is not plain for Mod+V, or with no key at all', () => {
    expectPaste(() => undefined)
    expect(pasteArrived()).toBe(false)
    expect(pasteArrived()).toBe(false)
  })

  it('is not run as well once the event has come', async () => {
    let ran = false
    expectPaste(() => {
      ran = true
    })
    pasteArrived()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(ran).toBe(false)
  })
})
