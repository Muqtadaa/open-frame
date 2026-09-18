import { plainTextOf } from '../../domain/rich-text.js'
import { defineObjectType } from '../../domain/registry.js'
import { textToSpans } from '../shared/text-to-spans.js'
import {
  CONFIDENCE_LEVELS,
  INSIGHT_VERSION,
  InsightDataSchema,
  type InsightData,
} from './schema.js'

export const INSIGHT_TYPE = 'insight'

export const insightType = defineObjectType<typeof INSIGHT_TYPE, InsightData>({
  type: INSIGHT_TYPE,

  schema: InsightDataSchema,
  currentVersion: INSIGHT_VERSION,
  // ADR 0012: `text` was a plain string until v2.
  migrations: { 2: textToSpans },

  create: (init) => ({
    data: {
      text: init?.text ?? [{ text: '' }],
      confidence: init?.confidence ?? 'unstated',
    },
    // Wider than an evidence card and no taller. An insight is one sentence
    // that has to be read across a board, not a quote to be read up close.
    frame: { width: 260, height: 160 },
  }),

  capabilities: {
    resizable: true,
    rotatable: false,
    textEditable: true,
    spatial: true,
    canHaveChildren: false,
    selectsAsUnit: false,
    connectable: true,
    styleProps: ['color', 'font', 'align', 'opacity'],
  },

  fields: [
    {
      key: 'confidence',
      label: 'Confidence',
      kind: 'select',
      options: CONFIDENCE_LEVELS,
    },
  ],

  describe: (object) => {
    const { confidence } = object.data
    const text = plainTextOf(object.data.text)
    return {
      searchText: text,
      summary: text.trim() === '' ? 'Empty insight' : text.slice(0, 120),
      fields: { text, confidence },
    }
  },
})
