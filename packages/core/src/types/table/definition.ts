import { plainTextOf } from '../../domain/rich-text.js'
import { defineObjectType } from '../../domain/registry.js'
import { borderToLines } from './border-to-lines.js'
import { isCovered } from './grid.js'
import {
  TABLE_VERSION,
  TableDataSchema,
  emptyCells,
  dividerPositions,
  resizeTrackAt,
  type TableData,
} from './schema.js'

export const TABLE_TYPE = 'table'

/** What a new table starts as: something you can type into immediately. */
const COLUMNS = 3
const ROWS = 3

export const tableType = defineObjectType<typeof TABLE_TYPE, TableData>({
  type: TABLE_TYPE,

  schema: TableDataSchema,
  currentVersion: TABLE_VERSION,
  migrations: { 2: borderToLines },

  create: (init) => {
    // Equal weights: a new table divides its frame evenly, and the first
    // column resize is what makes it uneven.
    const columns = init?.columns ?? Array.from({ length: COLUMNS }, () => 1)
    const rows = init?.rows ?? Array.from({ length: ROWS }, () => 1)
    const wanted = columns.length * rows.length

    /*
     * The cell list is REBUILT when it does not fit, rather than passed
     * through. `create` has no way to fail, so handing back a ragged table
     * would put an object in the document that its own schema refuses — and
     * the refusal would surface later, somewhere with no idea where it came
     * from.
     */
    const cells = init?.cells?.length === wanted ? init.cells : emptyCells(wanted)

    return {
      data: {
        columns: [...columns],
        rows: [...rows],
        cells,
        headerRow: init?.headerRow ?? true,
        /*
         * Lines and merges only with the cells they were made for: a merge
         * addressed to a grid that was just rebuilt would point at nothing,
         * and the schema would refuse the table `create` cannot fail to make.
         */
        ...(cells === init?.cells && init.lines !== undefined ? { lines: init.lines } : {}),
        ...(cells === init?.cells && init.merges !== undefined ? { merges: init.merges } : {}),
      },
      frame: { width: 420, height: 180 },
    }
  },

  capabilities: {
    resizable: true,
    /*
     * Not rotatable. A rotated table is a table you cannot type into without
     * the caret fighting the transform, and nothing about comparing rows is
     * helped by turning them. Shapes rotate because their meaning is their
     * outline; a table's meaning is its grid.
     */
    rotatable: false,
    textEditable: true,
    spatial: true,
    /*
     * A cell is not a child object, so this is false and means it. The whole
     * reason the grid lives in `data` is that four hundred child objects would
     * be four hundred bounds calculations per cull.
     */
    canHaveChildren: false,
    selectsAsUnit: false,
    connectable: true,
    /*
     * No `fill`: a table's ground is its page, and a filled one hides the rule
     * lines that make it a table. Declared properties that the view ignores
     * are what rule 21 forbids, so only what is honoured is listed.
     */
    styleProps: ['color', 'textColor', 'strokeColor', 'font', 'align', 'verticalAlign', 'opacity', 'stroke'],
  },

  /**
   * The column and row boundaries, as fractions of the table's extent.
   *
   * Declared here rather than detected by the overlay, for exactly the reason
   * `endpoints` is: `object.type === 'table'` in a caller is the type switch
   * rule 5 forbids, and it would have to grow a case for every later type with
   * internal divisions.
   *
   * The outer edges are NOT dividers. Those are the object's own bounds and are
   * moved by resizing it; offering them twice would be two controls doing
   * different things in the same place.
   */
  dividers: (object) => [
    ...dividerPositions(object.data.columns).map((at, index) => ({
      id: `c${String(index)}`,
      axis: 'x' as const,
      at,
    })),
    ...dividerPositions(object.data.rows).map((at, index) => ({
      id: `r${String(index)}`,
      axis: 'y' as const,
      at,
    })),
  ],

  /**
   * ONE track changes, and the table changes size to hold it.
   *
   * Dragging a column boundary sets the column before it to whatever width the
   * pointer asks for; every other column keeps the width it had and shifts
   * along, so the table grows or shrinks. It used to preserve the pair's sum,
   * which meant widening a column narrowed its neighbour and the table could
   * never change size — you could rearrange the space a table already had and
   * never ask for more.
   */
  moveDivider: (object, dividerId, to) => {
    const index = Number.parseInt(dividerId.slice(1), 10)
    if (!Number.isInteger(index) || index < 0) return null

    const across = dividerId.startsWith('c')
    if (!across && !dividerId.startsWith('r')) return null

    const extent = across ? object.frame.width : object.frame.height
    const moved = resizeTrackAt(
      across ? object.data.columns : object.data.rows,
      index,
      to,
      extent,
    )
    if (moved === null) return null

    const grew = moved.total - extent
    return {
      data: across ? { columns: moved.weights } : { rows: moved.weights },
      grow: { width: across ? grew : 0, height: across ? 0 : grew },
    }
  },

  describe: (object) => {
    /*
     * Every cell's text, in reading order, so search finds a table by anything
     * written anywhere in it. A table whose contents were invisible to search
     * would be the one place on a board where writing something hides it.
     */
    /*
     * Not the cells a merge covers. They keep their words so an unmerge can
     * bring them back, but a search that found a table by words nobody can
     * see on it would be pointing at nothing.
     */
    const width = object.data.columns.length
    const cells = object.data.cells.map((cell, index) =>
      isCovered(object.data, Math.floor(index / width), index % width)
        ? ''
        : plainTextOf(cell.text).trim(),
    )
    const filled = cells.filter((text) => text !== '')
    const shape = `${String(object.data.columns.length)}x${String(object.data.rows.length)}`

    return {
      searchText: cells.join(' '),
      summary:
        filled.length === 0
          ? `Empty ${shape} table`
          : `${shape} table: ${filled.slice(0, 6).join(', ').slice(0, 120)}`,
      gist: filled.slice(0, 6).join(', ').slice(0, 120),
      fields: { shape, text: filled.join(' ') },
    }
  },
})
