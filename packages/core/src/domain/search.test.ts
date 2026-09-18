import { beforeEach, describe, expect, it } from 'vitest'

import { createTestHarness, type TestHarness } from '../testing.js'
import { richFromPlain } from './rich-text.js'
import { parseQuery, searchBoard } from './search.js'

function make(h: TestHarness, type: string, data: Record<string, unknown>): void {
  const result = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [{ type, x: 0, y: 0, data }],
  })
  if (!result.ok) throw result.error
}

function find(h: TestHarness, query: string): string[] {
  return searchBoard(h.store.getDocument(), h.registry, query).map((r) => r.summary)
}

describe('parsing a query', () => {
  it('reads bare words as text', () => {
    expect(parseQuery('pricing page')).toEqual([
      { kind: 'text', value: 'pricing' },
      { kind: 'text', value: 'page' },
    ])
  })

  it('reads the two structured filters', () => {
    expect(parseQuery('type:evidence tag:pricing')).toEqual([
      { kind: 'type', value: 'evidence' },
      { kind: 'tag', value: 'pricing' },
    ])
  })

  it('reads a hash as a tag, because that is how people write one', () => {
    expect(parseQuery('#pricing')).toEqual([{ kind: 'tag', value: 'pricing' }])
  })

  /**
   * A half-typed filter is TEXT, not an empty filter that matches everything.
   * Someone typing `type:` has not finished, and a search that emptied the
   * board mid-keystroke would be unusable.
   */
  it('treats an unfinished prefix as text', () => {
    expect(parseQuery('type:')).toEqual([{ kind: 'text', value: 'type:' }])
    expect(parseQuery('#')).toEqual([{ kind: 'text', value: '#' }])
  })

  it('ignores surrounding and repeated whitespace', () => {
    expect(parseQuery('   a    b  ')).toHaveLength(2)
    expect(parseQuery('   ')).toEqual([])
  })
})

describe('searching a board', () => {
  let h: TestHarness
  beforeEach(() => {
    h = createTestHarness()
    make(h, 'sticky', { text: richFromPlain('Customers do not understand pricing') })
    make(h, 'evidence', {
      text: richFromPlain('Could not find the price'),
      source: 'September usability study',
      participant: 'P07',
      tags: ['pricing', 'comprehension'],
    })
    make(h, 'insight', {
      text: richFromPlain('Pricing is not discoverable'),
      confidence: 'high',
    })
  })

  it('finds objects by their text', () => {
    expect(find(h, 'discoverable')).toEqual(['Pricing is not discoverable'])
  })

  it('is case-insensitive', () => {
    expect(find(h, 'PRICING')).toHaveLength(3)
  })

  /**
   * The point of the whole phase: a field that is not the object's text is
   * still searchable, because `describe()` flattens it. A sticky saying the
   * same words has no source, so this finds one object and not two.
   */
  it('finds an object by a semantic field, not just its text', () => {
    expect(find(h, 'September')).toEqual(['Could not find the price'])
    expect(find(h, 'P07')).toEqual(['Could not find the price'])
  })

  it('narrows as terms are added, rather than widening', () => {
    expect(find(h, 'pricing')).toHaveLength(3)
    expect(find(h, 'pricing discoverable')).toHaveLength(1)
  })

  it('filters by type', () => {
    expect(find(h, 'type:evidence')).toEqual(['Could not find the price'])
    expect(find(h, 'type:insight pricing')).toEqual(['Pricing is not discoverable'])
  })

  it('filters by tag, and only on a real tag', () => {
    expect(find(h, 'tag:pricing')).toEqual(['Could not find the price'])
    // The word appears in every object's text, but is a TAG on only one.
    expect(find(h, '#comprehension')).toHaveLength(1)
    expect(find(h, '#discoverable')).toEqual([])
  })

  /** An empty box means "you have not asked yet", not "show me everything". */
  it('returns nothing for an empty query', () => {
    expect(find(h, '')).toEqual([])
    expect(find(h, '   ')).toEqual([])
  })

  it('finds nothing rather than everything when nothing matches', () => {
    expect(find(h, 'xyzzy')).toEqual([])
  })

  it('skips hidden objects', () => {
    const doc = h.store.getDocument()
    const id = [...doc.objects.values()].find((o) => o.type === 'insight')?.id
    expect(id).toBeDefined()
    if (id === undefined) return
    h.dispatcher.dispatch({ kind: 'SetHidden', ids: [id], hidden: true })
    expect(find(h, 'discoverable')).toEqual([])
  })

  /**
   * A relation has no place on the board, so a result the reveal cannot pan to
   * is not a result.
   */
  it('never returns an object that is not on the board', () => {
    const doc = h.store.getDocument()
    const [a, b] = [...doc.objects.values()].map((o) => o.id)
    if (a === undefined || b === undefined) return
    make(h, 'relation', { from: a, to: b, predicate: 'cites' })
    expect(searchBoard(h.store.getDocument(), h.registry, 'cites')).toEqual([])
  })

  it('orders results predictably rather than by z-order', () => {
    const first = find(h, 'pricing')
    expect([...first].sort((x, y) => x.localeCompare(y))).toEqual(first)
  })
})
