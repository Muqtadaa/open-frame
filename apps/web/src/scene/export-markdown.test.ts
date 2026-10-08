import { asObjectId, richFromPlain, type ObjectId } from '@openframe/core'
import { createTestHarness, type TestHarness } from '@openframe/core/testing'
import { beforeEach, describe, expect, it } from 'vitest'

import { exportMarkdown } from './export-markdown.js'
import { typeLabel } from './type-noun.js'

/**
 * A board as a readout (ADR 0020): what it says, organised as it is, with
 * each claim's grounds beside it. Built through the dispatcher, as a board is.
 */
let h: TestHarness
let made = 0

beforeEach(() => {
  h = createTestHarness()
  made = 0
})

function make(
  type: string,
  at: { x: number; y: number },
  data: Record<string, unknown> = {},
  parentId?: ObjectId,
): ObjectId {
  made += 1
  const id = asObjectId(`obj_${type}_${String(made)}`)
  const result = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [
      {
        id,
        type,
        x: at.x,
        y: at.y,
        width: 100,
        height: 100,
        data,
        ...(parentId === undefined ? {} : { parentId }),
      },
    ],
  })
  if (!result.ok) throw result.error
  return id
}

function cite(from: ObjectId, to: ObjectId): void {
  made += 1
  const result = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [
      {
        id: asObjectId(`obj_relation_${String(made)}`),
        type: 'relation',
        x: 0,
        y: 0,
        data: { from, to, predicate: 'cites' },
      },
    ],
  })
  if (!result.ok) throw result.error
}

const words = (text: string) => ({ text: richFromPlain(text) })

const exportAll = () =>
  exportMarkdown(h.store.getDocument(), h.registry, {
    scope: { kind: 'board' },
    exportedOn: '8 Oct 2026',
  })

describe('a board as Markdown', () => {
  it('says when a board has nothing on it', () => {
    expect(exportAll()).toBe('# Test board\n\nExported 8 Oct 2026 · nothing on this board\n')
  })

  it('heads a frame and lists what it holds under it', () => {
    const frame = make('frame', { x: 0, y: 0 }, { name: richFromPlain('Interviews') })
    make('sticky', { x: 10, y: 10 }, words('Pricing is confusing'), frame)
    expect(exportAll()).toContain('## Frame: Interviews\n\n- **Sticky note:** Pricing is confusing')
  })

  it('lists loose objects before any frame, so none reads as inside one', () => {
    make('frame', { x: 0, y: 0 }, { name: richFromPlain('Later') })
    make('sticky', { x: 500, y: 500 }, words('Loose'))
    const text = exportAll()
    expect(text.indexOf('Loose')).toBeLessThan(text.indexOf('## Frame: Later'))
  })

  it('nests frames as deeper headings, never past six', () => {
    let parent: ObjectId | undefined
    for (let depth = 1; depth <= 7; depth += 1) {
      parent = make(
        'frame',
        { x: 0, y: 0 },
        { name: richFromPlain(`Level ${String(depth)}`) },
        parent,
      )
    }
    const text = exportAll()
    expect(text).toContain('## Frame: Level 1')
    expect(text).toContain('###### Frame: Level 5')
    expect(text).toContain('###### Frame: Level 7')
    expect(text).not.toContain('#######')
  })

  it('reads in rows from the top, each row from the left', () => {
    make('sticky', { x: 300, y: 0 }, words('Second'))
    make('sticky', { x: 0, y: 0 }, words('First'))
    make('sticky', { x: 0, y: 400 }, words('Third'))
    const text = exportAll()
    expect(text.indexOf('First')).toBeLessThan(text.indexOf('Second'))
    expect(text.indexOf('Second')).toBeLessThan(text.indexOf('Third'))
  })

  it('writes a record with the labels its type declares', () => {
    make(
      'evidence',
      { x: 0, y: 0 },
      {
        ...words('Three of five could not find the price'),
        source: 'September study',
        participant: 'P07',
        tags: ['pricing', 'navigation'],
      },
    )
    expect(exportAll()).toContain(
      '- **Evidence:** Three of five could not find the price\n' +
        '  - Source: September study\n' +
        '  - Participant: P07\n' +
        '  - Tags: pricing, navigation',
    )
  })

  it('keeps the formatting of what was written', () => {
    make(
      'sticky',
      { x: 0, y: 0 },
      {
        text: [
          { text: 'Ideas' },
          { text: '\n' },
          { text: 'cheaper', marks: ['bold'] },
          { text: '\n', list: 'bullet' },
          { text: 'clearer' },
          { text: '\n', list: 'bullet' },
        ],
      },
    )
    expect(exportAll()).toContain('- **Sticky note:** Ideas\n\n  - **cheaper**\n  - clearer')
  })

  it('escapes words Markdown would read as structure', () => {
    make('sticky', { x: 0, y: 0 }, words('# not a heading'))
    expect(exportAll()).toContain('- **Sticky note:** \\# not a heading')
  })

  it('names what a claim stands on, and what stands on it', () => {
    const evidence = make('evidence', { x: 0, y: 0 }, words('Price hidden below the fold'))
    const insight = make('insight', { x: 300, y: 0 }, words('People cannot find the price'))
    cite(insight, evidence)
    const text = exportAll()
    expect(text).toContain(
      '- **Insight:** People cannot find the price\n' +
        '  - Confidence: unstated\n' +
        '  - Cites: Evidence: Price hidden below the fold',
    )
    expect(text).toContain('  - Insight that cites this: People cannot find the price')
    // A relation is shown by what it joins, never as an item of its own.
    expect(text).not.toContain('**Relation')
  })

  it('ends a board with the claims that cite nothing', () => {
    make('insight', { x: 0, y: 0 }, words('Unfounded'))
    expect(exportAll()).toMatch(/## Citing nothing\n\n- Insight: Unfounded\n$/)
  })

  it('leaves out what has no words and no record, and counts it all the same', () => {
    make('shape', { x: 0, y: 0 })
    make('sticky', { x: 0, y: 200 }, words('Said'))
    const text = exportAll()
    expect(text).toContain('Exported 8 Oct 2026 · 2 objects')
    expect(text).not.toContain('**Shape')
  })
})

describe('part of a board as Markdown', () => {
  it('exports a frame with what it holds, and nothing else', () => {
    const frame = make('frame', { x: 0, y: 0 }, { name: richFromPlain('Interviews') })
    make('sticky', { x: 10, y: 10 }, words('Inside'), frame)
    make('sticky', { x: 900, y: 900 }, words('Outside'))
    const text = exportMarkdown(h.store.getDocument(), h.registry, {
      scope: { kind: 'objects', ids: [frame] },
      exportedOn: '8 Oct 2026',
    })
    expect(text).toContain('# Test board — Interviews')
    expect(text).toContain('Inside')
    expect(text).not.toContain('Outside')
    expect(text).not.toContain('## Citing nothing')
  })

  it('exports a selection, and says what it is', () => {
    const a = make('sticky', { x: 0, y: 0 }, words('One'))
    const b = make('sticky', { x: 200, y: 0 }, words('Two'))
    make('sticky', { x: 400, y: 0 }, words('Three'))
    const text = exportMarkdown(h.store.getDocument(), h.registry, {
      scope: { kind: 'objects', ids: [a, b] },
      exportedOn: '8 Oct 2026',
    })
    expect(text).toContain('# Test board — 2 selected')
    expect(text).toContain('One')
    expect(text).toContain('Two')
    expect(text).not.toContain('Three')
  })

  it('names grounds outside the export, and says they are', () => {
    const evidence = make('evidence', { x: 0, y: 0 }, words('Elsewhere'))
    const insight = make('insight', { x: 300, y: 0 }, words('Here'))
    cite(insight, evidence)
    const text = exportMarkdown(h.store.getDocument(), h.registry, {
      scope: { kind: 'objects', ids: [insight] },
      exportedOn: '8 Oct 2026',
    })
    expect(text).toContain('  - Cites: Evidence: Elsewhere (not in this export)')
  })
})

describe('every type, as the registry has it', () => {
  /*
   * A type the exporter names nowhere still has to come out: its words if it
   * has any, its record if it has one. Read off the registry, so a type added
   * tomorrow is held to it without anybody adding it here.
   */
  it('exports the words of every spatial type that has words', () => {
    const spatial = h.registry.list().filter((definition) => definition.capabilities.spatial)
    expect(spatial.length).toBeGreaterThan(5)
    const ids = spatial.map((definition, index) => make(definition.type, { x: index * 300, y: 0 }))
    const doc = h.store.getDocument()
    const text = exportMarkdown(doc, h.registry, {
      scope: { kind: 'board' },
      exportedOn: '8 Oct 2026',
    })
    expect(text).toContain(`${String(ids.length)} objects`)
    for (const id of ids) {
      const object = doc.objects.get(id)
      if (object === undefined) throw new Error(`no ${id}`)
      const gist = h.registry.describeObject(object).gist
      if (gist === '') continue
      // As an item ("**Frame:** …") or a heading ("Frame: …"): labelled, either way.
      const label = typeLabel(object.type)
      expect(
        text.includes(`**${label}:** ${gist}`) || text.includes(`# ${label}: ${gist}`),
        `${object.type} exports as "${label}: ${gist}"`,
      ).toBe(true)
    }
  })
})
