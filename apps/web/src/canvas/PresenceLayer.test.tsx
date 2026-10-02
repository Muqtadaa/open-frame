import { afterEach, describe, expect, it } from 'vitest'

import { mountOnBoard, type Mounted } from '../test-render.js'
import { PresenceLayer } from './PresenceLayer.js'

/*
 * A live region announces what CHANGES in it after it exists. Inserted with
 * its words already in it — which is what happened when somebody joined a
 * room where a peer was already editing — it says nothing at all.
 */
let ui: Mounted | undefined

afterEach(() => {
  ui?.unmount()
})

describe('who is editing what, for assistive tech', () => {
  it('keeps its status region on the page before anybody is there to describe', async () => {
    ui = await mountOnBoard(<PresenceLayer />)
    const status = ui.container.querySelector('[role="status"][data-testid="presence-status"]')
    expect(status).not.toBeNull()
    expect(status?.textContent).toBe('')
  })
})
