import { plainTextOf } from '../../domain/rich-text.js'
import { defineObjectType } from '../../domain/registry.js'
import {
  REQUIREMENT_PRIORITY,
  REQUIREMENT_VERSION,
  RequirementDataSchema,
  type RequirementData,
} from './schema.js'

export const REQUIREMENT_TYPE = 'requirement'

export const requirementType = defineObjectType<typeof REQUIREMENT_TYPE, RequirementData>({
  type: REQUIREMENT_TYPE,

  schema: RequirementDataSchema,
  currentVersion: REQUIREMENT_VERSION,
  migrations: {},

  create: (init) => ({
    data: {
      text: init?.text ?? [{ text: '' }],
      priority: init?.priority ?? 'unset',
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

  fields: [{ key: 'priority', label: 'Priority', kind: 'select', options: REQUIREMENT_PRIORITY }],

  derivations: [{ type: 'task', predicate: 'implements' }],

  describe: (object) => {
    const text = plainTextOf(object.data.text)
    const { priority } = object.data
    return {
      searchText: [text, priority].filter(Boolean).join(' '),
      summary: text.trim() === '' ? 'Empty requirement' : text.slice(0, 120),
      fields: { text, priority },
    }
  },
})
