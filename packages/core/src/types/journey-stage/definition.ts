import { plainTextOf } from '../../domain/rich-text.js'
import { defineObjectType } from '../../domain/registry.js'
import {
  JOURNEY_STAGE_SENTIMENT,
  JOURNEY_STAGE_VERSION,
  JourneyStageDataSchema,
  type JourneyStageData,
} from './schema.js'

export const JOURNEY_STAGE_TYPE = 'journey-stage'

export const journeystageType = defineObjectType<typeof JOURNEY_STAGE_TYPE, JourneyStageData>({
  type: JOURNEY_STAGE_TYPE,

  schema: JourneyStageDataSchema,
  currentVersion: JOURNEY_STAGE_VERSION,
  migrations: {},

  create: (init) => ({
    data: {
      text: init?.text ?? [{ text: '' }],
      sentiment: init?.sentiment ?? 'unstated',
    },
    frame: { width: 220, height: 200 },
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
    { key: 'sentiment', label: 'Sentiment', kind: 'select', options: JOURNEY_STAGE_SENTIMENT },
  ],

  describe: (object) => {
    const text = plainTextOf(object.data.text)
    const { sentiment } = object.data
    return {
      searchText: [text, sentiment].filter(Boolean).join(' '),
      summary: text.trim() === '' ? 'Empty journey stage' : text.slice(0, 120),
      fields: { text, sentiment },
    }
  },
})
