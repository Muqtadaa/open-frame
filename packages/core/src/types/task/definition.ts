import { plainTextOf } from '../../domain/rich-text.js'
import { defineObjectType } from '../../domain/registry.js'
import { TASK_STATUS, TASK_VERSION, TaskDataSchema, type TaskData } from './schema.js'

export const TASK_TYPE = 'task'

export const taskType = defineObjectType<typeof TASK_TYPE, TaskData>({
  type: TASK_TYPE,

  schema: TaskDataSchema,
  currentVersion: TASK_VERSION,
  migrations: {},

  create: (init) => ({
    data: {
      text: init?.text ?? [{ text: '' }],
      assignee: init?.assignee ?? '',
      status: init?.status ?? 'todo',
    },
    frame: { width: 240, height: 140 },
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
    { key: 'assignee', label: 'Assignee', kind: 'text' },
    { key: 'status', label: 'Status', kind: 'select', options: TASK_STATUS },
  ],

  describe: (object) => {
    const text = plainTextOf(object.data.text)
    const { assignee, status } = object.data
    return {
      searchText: [text, assignee, status].filter(Boolean).join(' '),
      summary: text.trim() === '' ? 'Empty task' : text.slice(0, 120),
      fields: { text, assignee, status },
    }
  },
})
