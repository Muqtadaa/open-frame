import { asObjectId, richFromPlain, type ObjectId } from '@openframe/core'
import { CITES } from '@openframe/core/ai'
import { createTestHarness } from '@openframe/core/testing'
import { describe, expect, it } from 'vitest'

import { gatherSummaryNotes, summarisableCount, summaryObjects } from './ai-summary.js'

const note = (id: string, text: string, x: number, y = 0, parentId?: string) => ({
  id: asObjectId(id),
  type: 'sticky',
  x,
  y,
  data: { text: richFromPlain(text) },
  ...(parentId === undefined ? {} : { parentId: asObjectId(parentId) }),
})

/**
 * A frame "Interviews" holding two notes and a nested frame with a third, and
 * one loose note beside it.
 */
function board() {
  const h = createTestHarness()
  const frames = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [
      {
        id: asObjectId('obj_frame'),
        type: 'frame',
        x: 0,
        y: 0,
        width: 1200,
        height: 800,
        data: { name: richFromPlain('Interviews') },
      },
      {
        id: asObjectId('obj_inner'),
        type: 'frame',
        x: 600,
        y: 300,
        width: 500,
        height: 400,
        parentId: asObjectId('obj_frame'),
      },
    ],
  })
  expect(frames.ok).toBe(true)
  const notes = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [
      note('obj_a', 'Price is hidden', 40, 80, 'obj_frame'),
      note('obj_b', 'Shipping surprises', 300, 80, 'obj_frame'),
      note('obj_c', 'Returns are hard', 640, 360, 'obj_inner'),
      note('obj_loose', 'Love the colours', 1400, 0),
    ],
  })
  expect(notes.ok).toBe(true)
  return h
}

const ids = (...names: string[]) => names.map((name) => asObjectId(name))

describe('what a summary is made of', () => {
  it('expands a frame into every note inside it, nested frames included, and names it', () => {
    const h = board()
    const doc = h.store.getDocument()
    const gathered = gatherSummaryNotes(doc, h.registry, ids('obj_frame'))
    expect(gathered.ok).toBe(true)
    if (!gathered.ok) return
    // In the board's own order: the inner frame was made first, so its note leads.
    expect(gathered.request).toEqual({
      notes: [
        { ref: 'n1', text: 'Returns are hard' },
        { ref: 'n2', text: 'Price is hidden' },
        { ref: 'n3', text: 'Shipping surprises' },
      ],
      frame: 'Interviews',
    })
    // The note outside the frame is not part of it.
    expect([...gathered.notes.values()].map((n) => n.id)).not.toContain('obj_loose')
    expect(summarisableCount(doc, h.registry, ids('obj_frame'))).toBe(3)
  })

  it('takes a selection as it is, each note once, with no frame name for a mixed one', () => {
    const h = board()
    const doc = h.store.getDocument()
    const gathered = gatherSummaryNotes(doc, h.registry, ids('obj_a', 'obj_loose', 'obj_inner'))
    expect(gathered.ok && gathered.request).toEqual({
      notes: [
        { ref: 'n1', text: 'Price is hidden' },
        { ref: 'n2', text: 'Love the colours' },
        { ref: 'n3', text: 'Returns are hard' },
      ],
    })
    // A note selected alongside the frame it is in is sent once.
    const twice = gatherSummaryNotes(doc, h.registry, ids('obj_frame', 'obj_a'))
    expect(twice.ok && twice.request.notes).toHaveLength(3)
  })

  it('refuses fewer than two notes', () => {
    const h = board()
    expect(gatherSummaryNotes(h.store.getDocument(), h.registry, ids('obj_inner'))).toEqual({
      ok: false,
      why: 'too-few',
    })
    expect(summarisableCount(h.store.getDocument(), h.registry, ids('obj_inner'))).toBe(1)
  })
})

describe('laying a summary out', () => {
  it('puts one text box beside the frame, citing each note a point rests on, as one change', () => {
    const h = board()
    const before = h.store.getDocument()
    const gathered = gatherSummaryNotes(before, h.registry, ids('obj_frame'))
    if (!gathered.ok) throw new Error('not gathered')
    let n = 0
    const { objects, box } = summaryObjects({
      summary: {
        title: 'What we heard',
        points: [
          { text: 'Costs come too late.', refs: ['n1', 'n2'] },
          { text: 'Returns hurt.', refs: ['n3', 'n1'] },
        ],
      },
      notes: gathered.notes,
      source: { x: 0, y: 0, width: 1200, height: 800 },
      occupied: [{ x: 0, y: 0, width: 1200, height: 800, container: true }],
      view: { x: -4000, y: -4000, width: 8000, height: 8000 },
      ids: (): ObjectId => asObjectId(`obj_new_${String(n++)}`),
    })
    const result = h.dispatcher.transact(
      'Summarise with AI',
      [{ kind: 'CreateObjects', objects }],
      {
        origin: 'ai',
      },
    )
    expect(result.ok).toBe(true)
    const after = h.store.getDocument()
    const text = after.objects.get(box)!
    expect(text.type).toBe('text')
    const f = text.frame
    expect(f.x < 1200 && f.x + f.width > 0 && f.y < 800 && f.y + f.height > 0).toBe(false)
    const cites = [...after.objects.values()]
      .filter((o) => o.type === 'relation')
      .map((o) => o.data as { from: ObjectId; to: ObjectId; predicate: string })
    expect(cites.every((c) => c.from === box && c.predicate === CITES)).toBe(true)
    expect(cites.map((c) => c.to).sort()).toEqual(['obj_a', 'obj_b', 'obj_c'])
    h.dispatcher.undo()
    expect(h.store.getDocument().objects.size).toBe(before.objects.size)
  })
})
