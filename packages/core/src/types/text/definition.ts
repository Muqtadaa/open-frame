import { plainTextOf } from '../../domain/rich-text.js'
import { defineObjectType } from '../../domain/registry.js'
import { resizeTokens } from '../shared/resize-tokens.js'
import { textToSpans } from '../shared/text-to-spans.js'
import { TEXT_VERSION, TextDataSchema, type TextData } from './schema.js'

export const TEXT_TYPE = 'text'

export const textType = defineObjectType<typeof TEXT_TYPE, TextData>({
  type: TEXT_TYPE,

  schema: TextDataSchema,
  currentVersion: TEXT_VERSION,
  /*
   * v2: `text` was a plain string until spans (ADR 0012).
   * v3: the size scale widened, and its tokens were renamed.
   */
  migrations: { 2: textToSpans, 3: resizeTokens },

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
