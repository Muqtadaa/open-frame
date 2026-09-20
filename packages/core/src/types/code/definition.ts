import { defineObjectType } from '../../domain/registry.js'
import { CODE_VERSION, CodeDataSchema, type CodeData } from './schema.js'

export const CODE_TYPE = 'code'

export const codeType = defineObjectType<typeof CODE_TYPE, CodeData>({
  type: CODE_TYPE,

  schema: CodeDataSchema,
  currentVersion: CODE_VERSION,
  // Nothing to migrate: this type has only ever had one shape.
  migrations: {},

  create: (init) => ({
    data: {
      code: init?.code ?? '',
      language: init?.language ?? 'plain',
    },
    frame: { width: 420, height: 220 },
  }),

  capabilities: {
    resizable: true,
    /*
     * Not rotatable, for the reason a table is not: code is read line by line,
     * and a rotated block is one nobody can read or put a caret into.
     */
    rotatable: false,
    textEditable: true,
    spatial: true,
    canHaveChildren: false,
    selectsAsUnit: false,
    connectable: true,
    /*
     * No `color`, `align` or `font`. A code block's typeface is monospace by
     * definition, its alignment is left by definition, and its colours come
     * from the highlighter rather than from a picker — offering any of them
     * would be a control that either does nothing or breaks the thing it is
     * applied to. Rule 21: only what the view honours is declared.
     */
    styleProps: ['opacity', 'stroke', 'strokeColor'],
  },

  describe: (object) => {
    const code = object.data.code
    const firstLine = code.split('\n').find((line) => line.trim() !== '') ?? ''
    return {
      // Searchable by what is IN it: a board where pasting code hid it would
      // be the one place writing something makes it harder to find.
      searchText: code,
      summary:
        code.trim() === ''
          ? 'Empty code block'
          : `${object.data.language}: ${firstLine.trim().slice(0, 100)}`,
      fields: { language: object.data.language, code },
    }
  },
})
