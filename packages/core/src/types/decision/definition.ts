import { plainTextOf } from '../../domain/rich-text.js'
import { defineObjectType } from '../../domain/registry.js'
import {
  DECISION_STATUS,
  DECISION_VERSION,
  DecisionDataSchema,
  type DecisionData,
} from './schema.js'

export const DECISION_TYPE = 'decision'

export const decisionType = defineObjectType<typeof DECISION_TYPE, DecisionData>({
  type: DECISION_TYPE,

  schema: DecisionDataSchema,
  currentVersion: DECISION_VERSION,
  migrations: {},

  create: (init) => ({
    data: {
      text: init?.text ?? [{ text: '' }],
      rationale: init?.rationale ?? '',
      status: init?.status ?? 'proposed',
    },
    frame: { width: 280, height: 180 },
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

  fields: [
    { key: 'rationale', label: 'Rationale', kind: 'longText' },
    { key: 'status', label: 'Status', kind: 'select', options: DECISION_STATUS },
  ],

  // And a decision is worth nothing until somebody does the work.
  derivations: [{ type: 'task', predicate: 'implements' }],

  describe: (object) => {
    const text = plainTextOf(object.data.text)
    const { rationale, status } = object.data
    return {
      searchText: [text, rationale, status].filter(Boolean).join(' '),
      summary: text.trim() === '' ? 'Empty decision' : text.slice(0, 120),
      fields: { text, rationale, status },
    }
  },
})
