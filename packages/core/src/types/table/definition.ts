import { plainTextOf } from '../../domain/rich-text.js'
import { defineObjectType } from '../../domain/registry.js'
import {
  TABLE_VERSION,
  TableDataSchema,
  emptyCells,
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
  // Nothing to migrate: this type has only ever had one shape.
  migrations: {},

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
    styleProps: ['color', 'font', 'align', 'opacity', 'stroke'],
  },

  describe: (object) => {
    /*
     * Every cell's text, in reading order, so search finds a table by anything
     * written anywhere in it. A table whose contents were invisible to search
     * would be the one place on a board where writing something hides it.
     */
    const cells = object.data.cells.map((cell) => plainTextOf(cell.text).trim())
    const filled = cells.filter((text) => text !== '')
    const shape = `${String(object.data.columns.length)}x${String(object.data.rows.length)}`

    return {
      searchText: cells.join(' '),
      summary:
        filled.length === 0
          ? `Empty ${shape} table`
          : `${shape} table: ${filled.slice(0, 6).join(', ').slice(0, 120)}`,
      fields: { shape, text: filled.join(' ') },
    }
  },
})
