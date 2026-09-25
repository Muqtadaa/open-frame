import { describe, expect, it } from 'vitest'

import { plainTextOf } from '../../domain/rich-text.js'
import { deserializeBoard } from '../../schema/deserialize.js'
import { createDefaultRegistry } from '../index.js'
import { borderToLines } from './border-to-lines.js'
import {
  clearCells,
  deleteTracks,
  expandToMerges,
  insertTracks,
  isCovered,
  lineLookup,
  mergeRange,
  rangeBetween,
  setLines,
  unmergeRange,
  wholeTable,
} from './grid.js'
import { TableDataSchema, emptyCells, type TableData } from './schema.js'
import frozen from './__fixtures__/v1-tables.json' with { type: 'json' }

/** A table whose cells say where they are, so a move is visible. */
function named(columns: number, rows: number, over: Partial<TableData> = {}): TableData {
  const cells = emptyCells(columns * rows).map((_, index) => ({
    text: [{ text: `${String(Math.floor(index / columns))}.${String(index % columns)}` }],
  }))
  return {
    columns: Array.from({ length: columns }, () => 1),
    rows: Array.from({ length: rows }, () => 1),
    cells,
    headerRow: false,
    ...over,
  }
}

const texts = (data: TableData): string[][] => {
  const width = data.columns.length
  return data.rows.map((_, row) =>
    data.cells.slice(row * width, row * width + width).map((cell) => plainTextOf(cell.text)),
  )
}

const valid = (data: TableData): boolean => TableDataSchema.safeParse(data).success

describe('inserting rows and columns anywhere', () => {
  it('puts a row in the middle and moves the rest down', () => {
    const next = insertTracks(named(2, 2), 'row', 1)
    expect(texts(next)).toEqual([
      ['0.0', '0.1'],
      ['', ''],
      ['1.0', '1.1'],
    ])
    expect(valid(next)).toBe(true)
  })

  it('puts a column in the middle of every row', () => {
    const next = insertTracks(named(2, 2), 'column', 1)
    expect(texts(next)).toEqual([
      ['0.0', '', '0.1'],
      ['1.0', '', '1.1'],
    ])
  })

  it('inserts several at once', () => {
    expect(texts(insertTracks(named(1, 2), 'row', 0, 3))).toEqual([
      [''],
      [''],
      [''],
      ['0.0'],
      ['1.0'],
    ])
  })

  it('refuses past the maximum and outside the table', () => {
    const table = named(2, 2)
    expect(insertTracks(table, 'column', 1, 30)).toBe(table)
    expect(insertTracks(table, 'row', 5)).toBe(table)
  })

  describe('a new track is dressed like its neighbour', () => {
    const dressed = (): TableData => {
      const table = named(2, 2, { rows: [3, 1] })
      return {
        ...table,
        cells: table.cells.map((cell, index) =>
          index < 2 ? { ...cell, fill: 'yellow', textColor: 'red' } : cell,
        ),
      }
    }

    it('copies the fill, ink and height of the row before it, not its words', () => {
      const next = insertTracks(dressed(), 'row', 1)
      expect(next.rows).toEqual([3, 3, 1])
      expect(next.cells[2]).toEqual({ text: [{ text: '' }], fill: 'yellow', textColor: 'red' })
      expect(next.cells[3]).toEqual({ text: [{ text: '' }], fill: 'yellow', textColor: 'red' })
    })

    it('copies the one after it at the very start', () => {
      const next = insertTracks(dressed(), 'row', 0)
      expect(next.cells[0]?.fill).toBe('yellow')
      expect(next.rows[0]).toBe(3)
    })

    it('copies the body, not the header, just under a header row', () => {
      const next = insertTracks({ ...dressed(), headerRow: true }, 'row', 1)
      // Row 0 is the yellow header; the new row copies row 1 below it, which is plain.
      expect(next.cells[2]?.fill).toBeUndefined()
      expect(next.rows[1]).toBe(1)
    })

    it('copies a column’s cell colours down the new column', () => {
      const table = named(2, 2)
      const striped = {
        ...table,
        cells: table.cells.map((cell, index) =>
          index % 2 === 1 ? { ...cell, fill: 'blue' as const } : cell,
        ),
      }
      const next = insertTracks(striped, 'column', 2)
      expect(next.cells.map((cell) => cell.fill)).toEqual([
        undefined,
        'blue',
        'blue',
        undefined,
        'blue',
        'blue',
      ])
    })
  })

  describe('lines', () => {
    const boxed = (table: TableData): TableData =>
      setLines(table, wholeTable(table), 'outer', { weight: 'thick' })

    it('keeps a heavy outer border on the outside when rows are added at the end', () => {
      const next = insertTracks(boxed(named(1, 2)), 'row', 2)
      const line = lineLookup(next)
      expect(line('h', 3, 0)?.weight).toBe('thick')
      expect(line('h', 2, 0)).toBeUndefined()
      expect(line('h', 0, 0)?.weight).toBe('thick')
      // The new row's sides carry the border down with it.
      expect(line('v', 2, 0)?.weight).toBe('thick')
      expect(line('v', 2, 1)?.weight).toBe('thick')
      expect(valid(next)).toBe(true)
    })

    it('keeps it on the outside when a column is added at the start', () => {
      const next = insertTracks(boxed(named(2, 1)), 'column', 0)
      const line = lineLookup(next)
      expect(line('v', 0, 0)?.weight).toBe('thick')
      expect(line('v', 0, 1)).toBeUndefined()
      expect(line('h', 0, 0)?.weight).toBe('thick')
    })

    it('copies a ruled inner line into the rows it inserts', () => {
      const ruled = setLines(
        named(1, 3),
        rangeBetween({ row: 0, col: 0 }, { row: 2, col: 0 }),
        'horizontal',
        {
          color: 'red',
        },
      )
      const next = insertTracks(ruled, 'row', 2)
      const line = lineLookup(next)
      for (const at of [1, 2, 3]) expect(line('h', at, 0)?.color, `line ${String(at)}`).toBe('red')
    })
  })

  it('grows a merge it lands inside and moves one it lands before', () => {
    const merged = mergeRange(named(3, 3), rangeBetween({ row: 0, col: 1 }, { row: 1, col: 2 }))
    expect(insertTracks(merged, 'row', 1).merges).toEqual([{ row: 0, col: 1, rows: 3, cols: 2 }])
    expect(insertTracks(merged, 'row', 0).merges).toEqual([{ row: 1, col: 1, rows: 2, cols: 2 }])
    // At its edge is beside it, not in it.
    expect(insertTracks(merged, 'column', 1).merges).toEqual([{ row: 0, col: 2, rows: 2, cols: 2 }])
  })
})

describe('deleting rows and columns anywhere', () => {
  it('takes a row out of the middle', () => {
    expect(texts(deleteTracks(named(1, 3), 'row', 1))).toEqual([['0.0'], ['2.0']])
  })

  it('takes columns out of the middle of every row', () => {
    expect(texts(deleteTracks(named(4, 1), 'column', 1, 2))).toEqual([['0.0', '0.3']])
  })

  it('never takes the last one', () => {
    const table = named(2, 2)
    expect(deleteTracks(table, 'row', 0, 2)).toBe(table)
  })

  it('keeps a box a box when its last row goes', () => {
    const table = named(1, 3)
    const boxed = setLines(table, wholeTable(table), 'outer', { weight: 'thick' })
    const next = deleteTracks(boxed, 'row', 2)
    const line = lineLookup(next)
    expect(line('h', 2, 0)?.weight).toBe('thick')
    expect(line('h', 1, 0)).toBeUndefined()
    expect(valid(next)).toBe(true)
  })

  it('shrinks a merge it cuts into, and drops one cut to a single cell', () => {
    const merged = mergeRange(named(3, 3), rangeBetween({ row: 0, col: 0 }, { row: 2, col: 0 }))
    expect(deleteTracks(merged, 'row', 1).merges).toEqual([{ row: 0, col: 0, rows: 2, cols: 1 }])
    expect(deleteTracks(merged, 'row', 0, 2).merges).toBeUndefined()
    expect(valid(deleteTracks(merged, 'row', 1))).toBe(true)
  })
})

describe('merging', () => {
  it('draws a block as one cell and keeps what it covers', () => {
    const merged = mergeRange(named(2, 2), rangeBetween({ row: 1, col: 1 }, { row: 0, col: 0 }))
    expect(merged.merges).toEqual([{ row: 0, col: 0, rows: 2, cols: 2 }])
    expect(isCovered(merged, 1, 1)).toBe(true)
    expect(isCovered(merged, 0, 0)).toBe(false)
    // The words are still there for an unmerge to bring back.
    expect(texts(unmergeRange(merged, wholeTable(merged)))).toEqual(texts(named(2, 2)))
    expect(unmergeRange(merged, wholeTable(merged)).merges).toBeUndefined()
  })

  it('takes a merge it touches in whole', () => {
    const first = mergeRange(named(3, 3), rangeBetween({ row: 0, col: 1 }, { row: 1, col: 2 }))
    expect(expandToMerges(first, rangeBetween({ row: 1, col: 0 }, { row: 1, col: 1 }))).toEqual({
      top: 0,
      left: 0,
      bottom: 1,
      right: 2,
    })
    const second = mergeRange(first, rangeBetween({ row: 1, col: 0 }, { row: 1, col: 1 }))
    expect(second.merges).toEqual([{ row: 0, col: 0, rows: 2, cols: 3 }])
  })

  it('merges nothing from one cell', () => {
    expect(
      mergeRange(named(2, 2), rangeBetween({ row: 0, col: 0 }, { row: 0, col: 0 })).merges,
    ).toBeUndefined()
  })

  it('leaves the words of covered cells out of search', () => {
    const registry = createDefaultRegistry()
    const merged = mergeRange(named(2, 1), rangeBetween({ row: 0, col: 0 }, { row: 0, col: 1 }))
    const described = registry.get('table')?.describe?.({ data: merged } as never)
    expect(described?.searchText).not.toContain('0.1')
  })
})

describe('the schema', () => {
  it('refuses overlapping merges', () => {
    const table = named(3, 3, {
      merges: [
        { row: 0, col: 0, rows: 2, cols: 2 },
        { row: 1, col: 1, rows: 2, cols: 2 },
      ],
    })
    expect(valid(table)).toBe(false)
  })

  it('refuses a merge off the grid, and one of a single cell', () => {
    expect(valid(named(2, 2, { merges: [{ row: 1, col: 0, rows: 2, cols: 1 }] }))).toBe(false)
    expect(valid(named(2, 2, { merges: [{ row: 0, col: 0, rows: 1, cols: 1 }] }))).toBe(false)
  })

  it('refuses a line off the grid, and two at one place', () => {
    expect(valid(named(2, 2, { lines: { h: [{ row: 3, col: 0, line: {} }], v: [] } }))).toBe(false)
    expect(valid(named(2, 2, { lines: { h: [], v: [{ row: 0, col: 3, line: {} }] } }))).toBe(false)
    const twice = { row: 0, col: 0, line: {} }
    expect(valid(named(2, 2, { lines: { h: [twice, twice], v: [] } }))).toBe(false)
    expect(
      valid(
        named(2, 2, {
          lines: { h: [{ row: 2, col: 1, line: {} }], v: [{ row: 1, col: 2, line: {} }] },
        }),
      ),
    ).toBe(true)
  })

  /** Zod strips unknown keys unless told not to — the rule 23 trap. */
  it('refuses a cell that still carries a v1 border', () => {
    const table = named(1, 1)
    expect(valid({ ...table, cells: [{ text: [{ text: '' }], border: 'red' } as never] })).toBe(
      false,
    )
  })
})

describe('ruling lines', () => {
  const range = rangeBetween({ row: 0, col: 0 }, { row: 1, col: 1 })
  const count = (data: TableData): number =>
    (data.lines?.h.length ?? 0) + (data.lines?.v.length ?? 0)

  it.each([
    ['all', 12],
    ['outer', 8],
    ['inner', 4],
    ['horizontal', 2],
    ['vertical', 2],
    ['top', 2],
    ['bottom', 2],
    ['left', 2],
    ['right', 2],
    ['none', 12],
  ] as const)('reaches the edges "%s" names', (preset, expected) => {
    expect(count(setLines(named(2, 2), range, preset, { color: 'red' }))).toBe(expected)
  })

  it('draws each side of a cell on the line its neighbour shares', () => {
    const table = setLines(
      named(2, 1),
      rangeBetween({ row: 0, col: 0 }, { row: 0, col: 0 }),
      'right',
      {
        color: 'red',
      },
    )
    // The right of 0.0 IS the left of 0.1: one line, one answer.
    expect(lineLookup(table)('v', 0, 1)?.color).toBe('red')
    const cleared = setLines(table, rangeBetween({ row: 0, col: 1 }, { row: 0, col: 1 }), 'left', {
      color: 'blue',
    })
    expect(lineLookup(cleared)('v', 0, 1)?.color).toBe('blue')
    expect(cleared.lines?.v).toHaveLength(1)
  })

  it('takes a line away with none and hands it back with reset', () => {
    const none = setLines(named(2, 2), range, 'none')
    expect(lineLookup(none)('h', 0, 0)).toEqual({ weight: 'none' })
    expect(setLines(none, range, 'reset').lines).toBeUndefined()
  })

  it('goes round a merge rather than through it', () => {
    const merged = mergeRange(named(3, 3), rangeBetween({ row: 0, col: 0 }, { row: 1, col: 1 }))
    const ruled = setLines(merged, rangeBetween({ row: 1, col: 1 }, { row: 1, col: 1 }), 'outer', {
      color: 'red',
    })
    const line = lineLookup(ruled)
    expect(line('h', 0, 0)?.color).toBe('red')
    expect(line('v', 1, 2)?.color).toBe('red')
    expect(valid(ruled)).toBe(true)
  })
})

it('clears the words of a range and keeps its dress', () => {
  const table = named(2, 1)
  const dressed = {
    ...table,
    cells: table.cells.map((cell) => ({ ...cell, fill: 'red' as const })),
  }
  const cleared = clearCells(dressed, rangeBetween({ row: 0, col: 1 }, { row: 0, col: 1 }))
  expect(texts(cleared)).toEqual([['0.0', '']])
  expect(cleared.cells[1]?.fill).toBe('red')
})

describe('any sequence of edits leaves a table its schema accepts', () => {
  it('holds over inserts, deletes, merges and lines', () => {
    let table = named(3, 3)
    const steps: ((data: TableData) => TableData)[] = [
      (d) => setLines(d, wholeTable(d), 'all', { color: 'red', weight: 'medium', dash: 'dashed' }),
      (d) => mergeRange(d, rangeBetween({ row: 1, col: 1 }, { row: 2, col: 2 })),
      (d) => insertTracks(d, 'row', 2, 2),
      (d) => insertTracks(d, 'column', 0),
      (d) => deleteTracks(d, 'column', 2),
      (d) => deleteTracks(d, 'row', 0, 3),
      (d) => setLines(d, wholeTable(d), 'inner', { weight: 'thick' }),
      (d) => insertTracks(d, 'column', d.columns.length, 3),
      (d) => deleteTracks(d, 'row', d.rows.length - 1),
    ]
    for (const [index, step] of steps.entries()) {
      table = step(table)
      const result = TableDataSchema.safeParse(table)
      expect(result.success, `step ${String(index)}: ${JSON.stringify(result.error?.issues)}`).toBe(
        true,
      )
    }
  })
})

describe('a board from before lines lived on the grid (v1 → v2)', () => {
  const registry = createDefaultRegistry()

  const open = (id: string): TableData => {
    const result = deserializeBoard(frozen, registry)
    if (result.status !== 'ok') throw new Error(`the board did not open: ${result.reason}`)
    expect(result.degraded).toEqual([])
    const object = result.document.objects.get(id as never)
    if (object === undefined) throw new Error(`${id} is missing`)
    return object.data as TableData
  }

  it('moves a cell border onto the right and bottom lines it drew', () => {
    const table = open('obj_table')
    const line = lineLookup(table)
    // Cell 1 is row 0, column 1: its right is the outer edge, its bottom the line under row 0.
    expect(line('v', 0, 2)).toEqual({ color: 'red' })
    expect(line('h', 1, 1)).toEqual({ color: 'red' })
    // Cell 3 is row 1, column 1.
    expect(line('v', 1, 2)).toEqual({ color: '#112233' })
    expect(line('h', 2, 1)).toEqual({ color: '#112233' })
    expect(table.lines?.h).toHaveLength(2)
    expect(table.lines?.v).toHaveLength(2)
  })

  it('keeps everything else a cell wore', () => {
    const table = open('obj_table')
    expect(table.cells[1]).toEqual({ text: [{ text: 'Status' }], fill: 'yellow' })
    expect(table.cells[2]).toEqual({ text: [{ text: 'Alpha' }], textColor: '#336699' })
    expect(table.cells[0]).toEqual({ text: [{ text: 'Name', marks: ['bold'] }] })
  })

  it('adds no lines to a table that had no borders', () => {
    expect(open('obj_table_plain').lines).toBeUndefined()
  })

  it('leaves what it cannot read for validation to refuse', () => {
    const malformed = {
      columns: [1],
      rows: [1],
      cells: [{ text: [{ text: '' }], border: 42 }],
      headerRow: false,
    }
    // The border stays, so the strict schema refuses the table rather than
    // accepting one the migration silently edited.
    const migrated = borderToLines(malformed)
    expect(migrated).toEqual(malformed)
    expect(TableDataSchema.safeParse(migrated).success).toBe(false)
    expect(borderToLines('nonsense')).toBe('nonsense')
    const odd = { columns: 'x', cells: [] }
    expect(borderToLines(odd)).toBe(odd)
  })
})
