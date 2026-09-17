import { defineObjectType } from '../../domain/registry.js'
import { TEXT_VERSION, TextDataSchema, type TextData } from './schema.js'

export const TEXT_TYPE = 'text'

export const textType = defineObjectType<typeof TEXT_TYPE, TextData>({
  type: TEXT_TYPE,

  schema: TextDataSchema,
  currentVersion: TEXT_VERSION,
  migrations: {},

  create: (init) => ({
    data: { text: init?.text ?? '' },
    frame: { width: 240, height: 48 },
  }),

  capabilities: {
    resizable: true,
    rotatable: false,
    textEditable: true,
    canHaveChildren: false,
    connectable: true,
    // No fill: text has no surface to fill. The registry is what stops the
    // toolbar offering a fill control for it.
    styleProps: ['color', 'font', 'align', 'opacity'],
  },

  describe: (object) => ({
    searchText: object.data.text,
    summary: object.data.text.trim() === '' ? 'Empty text' : object.data.text.slice(0, 120),
    fields: { text: object.data.text },
  }),
})
