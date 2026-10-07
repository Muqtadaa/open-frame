import { afterEach, describe, expect, it } from 'vitest'

import { useInteractionStore } from '../interaction/interaction-store.js'
import { mountOnBoard, type Mounted } from '../test-render.js'
import { Session } from './Session.js'

/**
 * Alt+T asks for the Session sheet. Where there is no pill to hang it from —
 * a viewer with nothing running, a board with no session at all — the ask
 * must not wait: it used to sit in the store and open the sheet, focus and
 * all, the moment somebody else started a timer (Codex, on #89).
 */
let ui: Mounted | null = null

afterEach(() => {
  ui?.unmount()
  ui = null
  useInteractionStore.setState({ sessionOpen: false })
})

describe('the session sheet', () => {
  it('is not left asked for while there is no pill to open it from', async () => {
    useInteractionStore.setState({ sessionOpen: true })
    ui = await mountOnBoard(<Session />)
    expect(document.querySelector('[data-testid="session-button"]')).toBeNull()
    expect(useInteractionStore.getState().sessionOpen).toBe(false)
  })
})
