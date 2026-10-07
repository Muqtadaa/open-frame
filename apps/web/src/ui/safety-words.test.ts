import { describe, expect, it } from 'vitest'

import { safetyWords } from './safety-words.js'

describe('the safety readout', () => {
  it('says Saved alone on a board with no room', () => {
    expect(safetyWords('saved', null).label).toBe('Saved')
  })

  it('says the room is live beside Saved', () => {
    expect(safetyWords('saved', 'connected').label).toBe('Saved · Live')
    expect(safetyWords('saving', 'connected').label).toBe('Saving…')
  })

  it('says where the work is while the room is away, and never hides it', () => {
    const offline = safetyWords('saved', 'offline')
    expect(offline.label).toBe('Offline · saved here')
    expect(offline.tone).toBe('away')
    expect(safetyWords('saved', 'connecting').label).toBe('Reconnecting · saved here')
    expect(safetyWords('pending', 'offline').label).toBe('Offline · saving…')
  })

  it('puts a failed save first, whatever the room', () => {
    expect(safetyWords('failed', 'connected')).toMatchObject({ label: 'Not saved', tone: 'failed' })
    expect(safetyWords('failed', 'offline').label).toBe('Not saved')
  })
})
