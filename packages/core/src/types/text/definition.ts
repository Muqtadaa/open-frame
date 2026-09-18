import { plainTextOf } from '../../domain/rich-text.js'
import { defineObjectType } from '../../domain/registry.js'
import { textToSpans } from '../shared/text-to-spans.js'
import { TEXT_VERSION, TextDataSchema, type TextData } from './schema.js'

export const TEXT_TYPE = 'text'

export const textType = defineObjectType<typeof TEXT_TYPE, TextData>({
  type: TEXT_TYPE,

  schema: TextDataSchema,
  currentVersion: TEXT_VERSION,
  // ADR 0012: `text` was a plain string until v2.
  migrations: { 2: textToSpans },

  create: (init) => ({
    data: { text: init?.text ?? [{ text: '' }] },
    frame: { width: 240, height: 48 },
  }),

  capabilities: {
    resizable: true,
    rotatable: false,
    textEditable: true,
    spatial: true,
    canHaveChildren: false,
    selectsAsUnit: false,
    connectable: true,
    // No fill: text has no surface to fill. The registry is what stops the
    // toolbar offering a fill control for it.
    styleProps: ['color', 'font', 'align', 'opacity'],
  },

  describe: (object) => {
    const text = plainTextOf(object.data.text)
    return {
      searchText: text,
      summary: text.trim() === '' ? 'Empty text' : text.slice(0, 120),
      fields: { text },
    }
  },
})
