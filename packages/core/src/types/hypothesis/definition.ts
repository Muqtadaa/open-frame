import { plainTextOf } from '../../domain/rich-text.js'
import { defineObjectType } from '../../domain/registry.js'
import {
  HYPOTHESIS_STATUS,
  HYPOTHESIS_VERSION,
  HypothesisDataSchema,
  type HypothesisData,
} from './schema.js'

export const HYPOTHESIS_TYPE = 'hypothesis'

export const hypothesisType = defineObjectType<typeof HYPOTHESIS_TYPE, HypothesisData>({
  type: HYPOTHESIS_TYPE,

  schema: HypothesisDataSchema,
  currentVersion: HYPOTHESIS_VERSION,
  migrations: {},

  create: (init) => ({
    data: {
      text: init?.text ?? [{ text: '' }],
      status: init?.status ?? 'untested',
    },
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
    styleProps: ['color', 'textColor', 'font', 'align', 'opacity'],
  },

  fields: [{ key: 'status', label: 'Status', kind: 'select', options: HYPOTHESIS_STATUS }],

  // A prediction is settled by running something against it.
  derivations: [{ type: 'experiment', predicate: 'tests' }],

  describe: (object) => {
    const text = plainTextOf(object.data.text)
    const { status } = object.data
    return {
      searchText: [text, status].filter(Boolean).join(' '),
      summary: text.trim() === '' ? 'Empty hypothesis' : text.slice(0, 120),
      fields: { text, status },
    }
  },
})
