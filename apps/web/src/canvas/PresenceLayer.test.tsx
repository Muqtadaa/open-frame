import { afterEach, describe, expect, it } from 'vitest'

import type { BoardConnection } from '@openframe/collab'
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

/** A room with nobody else in it yet. */
const emptyRoom = {
  status: 'connected',
  onPeers: () => () => undefined,
  onStatus: () => () => undefined,
} as unknown as BoardConnection

describe('who is editing what, for assistive tech', () => {
  it('keeps its status region on the page before anybody is there to describe', async () => {
    ui = await mountOnBoard(<PresenceLayer />, { collaboration: emptyRoom })
    const status = ui.container.querySelector('[role="status"][data-testid="presence-status"]')
    expect(status).not.toBeNull()
    expect(status?.textContent).toBe('')
  })

  /*
   * And none on a board nobody else can join: it would be a second status
   * region for nothing, and one test reading "the status" found two.
   */
  it('has no status region on a board that is not in a room', async () => {
    ui = await mountOnBoard(<PresenceLayer />)
    expect(ui.container.querySelector('[data-testid="presence-status"]')).toBeNull()
  })
})
