import { plainTextOf } from '../../domain/rich-text.js'
import { defineObjectType } from '../../domain/registry.js'
import { resizeTokens } from '../shared/resize-tokens.js'
import { textToSpans } from '../shared/text-to-spans.js'
import { SHAPE_VERSION, ShapeDataSchema, type ShapeData } from './schema.js'

export const SHAPE_TYPE = 'shape'

export const shapeType = defineObjectType<typeof SHAPE_TYPE, ShapeData>({
  type: SHAPE_TYPE,

  schema: ShapeDataSchema,
  currentVersion: SHAPE_VERSION,
  /*
   * v2: `text` was a plain string until spans (ADR 0012).
   * v3: the size scale widened, and its tokens were renamed.
   */
  migrations: { 2: textToSpans, 3: resizeTokens },

  create: (init) => ({
    data: { shape: init?.shape ?? 'rectangle', text: init?.text ?? [{ text: '' }] },
    frame: { width: 160, height: 120 },
  }),

  capabilities: {
    resizable: true,
    rotatable: true,
    textEditable: true,
    spatial: true,
    canHaveChildren: false,
    selectsAsUnit: false,
    connectable: true,
    styleProps: ['color', 'fill', 'stroke', 'dash', 'font', 'align', 'opacity'],
  },

  describe: (object) => {
    const text = plainTextOf(object.data.text)
    return {
      searchText: text,
      summary:
        text.trim() === ''
          ? `Empty ${object.data.shape}`
          : `${object.data.shape}: ${text.slice(0, 100)}`,
      fields: { shape: object.data.shape, text },
    }
  },
})
