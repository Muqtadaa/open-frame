import { plainTextOf } from '../../domain/rich-text.js'
import { defineObjectType } from '../../domain/registry.js'
import {
  EXPERIMENT_STATUS,
  EXPERIMENT_VERSION,
  ExperimentDataSchema,
  type ExperimentData,
} from './schema.js'

export const EXPERIMENT_TYPE = 'experiment'

export const experimentType = defineObjectType<typeof EXPERIMENT_TYPE, ExperimentData>({
  type: EXPERIMENT_TYPE,

  schema: ExperimentDataSchema,
  currentVersion: EXPERIMENT_VERSION,
  migrations: {},

  create: (init) => ({
    data: {
      text: init?.text ?? [{ text: '' }],
      method: init?.method ?? '',
      status: init?.status ?? 'planned',
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
    styleProps: ['color', 'font', 'align', 'opacity'],
  },

  fields: [
    { key: 'method', label: 'Method', kind: 'text' },
    { key: 'status', label: 'Status', kind: 'select', options: EXPERIMENT_STATUS },
  ],

  // What a result is FOR: deciding something.
  derivations: [{ type: 'decision', predicate: 'informs' }],

  describe: (object) => {
    const text = plainTextOf(object.data.text)
    const { method, status } = object.data
    return {
      searchText: [text, method, status].filter(Boolean).join(' '),
      summary: text.trim() === '' ? 'Empty experiment' : text.slice(0, 120),
      fields: { text, method, status },
    }
  },
})
