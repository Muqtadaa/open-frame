import { asObjectId, richFromPlain, type ObjectId } from '@openframe/core'
import { MAX_NOTE_CHARS } from '@openframe/core/ai'
import { createTestHarness } from '@openframe/core/testing'
import { describe, expect, it } from 'vitest'

import { clusterableCount, clusterObjects, gatherClusterNotes } from './ai-cluster.js'

const note = (id: string, text: string, x: number) => ({
  id: asObjectId(id),
  type: 'sticky',
  x,
  y: 0,
  data: { text: richFromPlain(text) },
})

function board() {
  const h = createTestHarness()
  const made = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [
      note('obj_price', 'Price is hidden', 0),
      note('obj_ship', 'Shipping   cost\nsurprises', 220),
      note('obj_returns', 'Returns are hard', 440),
      note('obj_blank', '   ', 660),
      { id: asObjectId('obj_frame'), type: 'frame', x: 0, y: 400 },
    ],
  })
  expect(made.ok).toBe(true)
  return h
}

const ids = (...names: string[]) => names.map((name) => asObjectId(name))

describe('which selected objects the AI is sent', () => {
  it('sends each note’s text under a ref, and never its id', () => {
    const h = board()
    const doc = h.store.getDocument()
    const gathered = gatherClusterNotes(
      doc,
      h.registry,
      ids('obj_price', 'obj_ship', 'obj_returns', 'obj_blank', 'obj_frame'),
    )
    expect(gathered.ok).toBe(true)
    if (!gathered.ok) return
    expect(gathered.request).toEqual({
      notes: [
        { ref: 'n1', text: 'Price is hidden' },
        { ref: 'n2', text: 'Shipping cost surprises' },
        { ref: 'n3', text: 'Returns are hard' },
      ],
    })
    expect(JSON.stringify(gathered.request)).not.toContain('obj_')
    expect(gathered.notes.get('n2')?.id).toBe('obj_ship')
    expect(clusterableCount(doc, h.registry, ids('obj_price', 'obj_blank', 'obj_frame'))).toBe(1)
  })

  it('refuses too few notes, and clips a long one rather than sending it whole', () => {
    const h = board()
    expect(
      gatherClusterNotes(h.store.getDocument(), h.registry, ids('obj_price', 'obj_frame')),
    ).toEqual({ ok: false, why: 'too-few' })
    h.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [note('obj_long', 'x'.repeat(MAX_NOTE_CHARS * 2), 0)],
    })
    const gathered = gatherClusterNotes(
      h.store.getDocument(),
      h.registry,
      ids('obj_price', 'obj_ship', 'obj_long'),
    )
    expect(gathered.ok && gathered.request.notes[2]?.text.length).toBe(MAX_NOTE_CHARS)
  })
})

describe('laying a proposal out beside its notes', () => {
  it('makes copies in theme frames, beside the notes, as one change that leaves them alone', () => {
    const h = board()
    const before = h.store.getDocument()
    const gathered = gatherClusterNotes(
      before,
      h.registry,
      ids('obj_price', 'obj_ship', 'obj_returns'),
    )
    if (!gathered.ok) throw new Error('not gathered')
    let n = 0
    const { objects, outer } = clusterObjects({
      proposal: {
        title: 'Checkout',
        clusters: [{ label: 'Cost', summary: '', refs: ['n1', 'n2'] }],
        unassigned: ['n3'],
      },
      notes: gathered.notes,
      source: { x: 0, y: 0, width: 640, height: 200 },
      occupied: [{ x: 0, y: 0, width: 640, height: 200 }],
      view: { x: -2000, y: -2000, width: 4000, height: 4000 },
      ids: (): ObjectId => asObjectId(`obj_new_${String(n++)}`),
    })
    const result = h.dispatcher.transact('Cluster with AI', [{ kind: 'CreateObjects', objects }], {
      origin: 'ai',
    })
    expect(result.ok).toBe(true)

    const after = h.store.getDocument()
    for (const id of ids('obj_price', 'obj_ship', 'obj_returns')) {
      expect(after.objects.get(id)).toEqual(before.objects.get(id))
    }
    const frame = after.objects.get(outer)
    expect(frame?.type).toBe('frame')
    // Beside the notes, never over them.
    const f = frame!.frame
    const overlaps = f.x < 640 && f.x + f.width > 0 && f.y < 200 && f.y + f.height > 0
    expect(overlaps).toBe(false)
    // Every id minted for the first pass is the one the second pass used.
    // (The relations back to the originals are named by the dispatcher.)
    const named = objects.flatMap((spec) => (spec.id === undefined ? [] : [String(spec.id)]))
    expect(named.every((id) => id.startsWith('obj_new_'))).toBe(true)
    expect(new Set(named).size).toBe(named.length)
    expect(n).toBe(named.length)

    // One undo takes all of it away.
    h.dispatcher.undo()
    expect(h.store.getDocument().objects.size).toBe(before.objects.size)
  })
})
