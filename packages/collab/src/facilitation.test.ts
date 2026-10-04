import { asObjectId, createSequentialIdGenerator } from '@openframe/core'
import { idleTimer, playMusic, startTimer, stoppedMusic } from '@openframe/core/facilitation'
import { createTestHarness } from '@openframe/core/testing'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { facilitationOf, readFacilitation, writeMusic, writeTimer } from './facilitation.js'
import { CollabSession } from './session.js'

/**
 * The state of a session ABOUT the board — today its timer — kept beside the
 * board rather than in it (ADR 0017).
 *
 * It is not content: it is not undone, not copied and not exported, and an
 * older client must carry it without ever turning it into a change to the
 * board. That is why it is its own root map, like the change log.
 */

const WIRE = 'test:wire'

function join(docs: Y.Doc[]): void {
  for (const doc of docs) {
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === WIRE) return
      for (const other of docs) if (other !== doc) Y.applyUpdate(other, update, WIRE)
    })
  }
}

function peer(seed: number) {
  const harness = createTestHarness({ ids: createSequentialIdGenerator(seed) })
  const doc = new Y.Doc()
  // Counted rather than thrown: a refused remote patch is still an attempt to change the board.
  const refused: unknown[] = []
  CollabSession.join({
    doc,
    dispatcher: harness.dispatcher,
    by: 'Ada',
    onError: (error) => refused.push(error),
  })
  return { ...harness, doc, refused }
}

describe('facilitation state', () => {
  it('reaches every peer', () => {
    const a = new Y.Doc()
    const b = new Y.Doc()
    join([a, b])
    const timer = startTimer(idleTimer(), 1000, 'Ada')
    writeTimer(a, timer)
    expect(readFacilitation(b).timer).toEqual(timer)
  })

  it('carries the music beside the timer, each without disturbing the other', () => {
    const a = new Y.Doc()
    const b = new Y.Doc()
    join([a, b])
    const timer = startTimer(idleTimer(), 1000, 'Ada')
    const music = playMusic(stoppedMusic('jazzy'), 2000, 'Ada', [
      { id: 'jazzy-1', durationMs: 60_000 },
    ])
    writeTimer(a, timer)
    writeMusic(b, music)
    expect(readFacilitation(a)).toEqual({ timer, music })
    facilitationOf(a).set('music', { genre: 'polka' })
    expect(readFacilitation(b)).toEqual({ timer, music: null })
  })

  it('reads no timer where there is none, or where what is there is not one', () => {
    const doc = new Y.Doc()
    expect(readFacilitation(doc).timer).toBeNull()
    facilitationOf(doc).set('timer', { status: 'running', endsAt: 'whenever' })
    expect(readFacilitation(doc).timer).toBeNull()
  })

  /*
   * A client follows `objects` and `meta` and turns what changes there into
   * commands. The timer must never be one of them: starting a countdown is not
   * an edit to the board, and an undo that stopped somebody's timer would be
   * a very strange undo.
   */
  it('never becomes a change to the board', () => {
    const facilitator = peer(0)
    const participant = peer(1000)
    join([facilitator.doc, participant.doc])
    const meta = structuredClone(participant.store.getDocument().meta)
    let dispatched = 0
    participant.dispatcher.subscribe(() => {
      dispatched += 1
    })

    writeTimer(facilitator.doc, startTimer(idleTimer(), 1000, 'Ada'))
    writeMusic(
      facilitator.doc,
      playMusic(stoppedMusic(), 1000, 'Ada', [{ id: 'calm-1', durationMs: 60_000 }]),
    )

    expect(dispatched).toBe(0)
    expect(participant.refused).toEqual([])
    expect(participant.store.getDocument().meta).toEqual(meta)
    expect(participant.store.getDocument().objects.has(asObjectId('obj_timer'))).toBe(false)
    expect(participant.dispatcher.undoStack.canUndo).toBe(false)
  })
})
