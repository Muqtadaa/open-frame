import { defineObjectType } from '../../domain/registry.js'
import { STICKY_VERSION, StickyDataSchema, type StickyData } from './schema.js'

export const STICKY_TYPE = 'sticky'

export const stickyType = defineObjectType<typeof STICKY_TYPE, StickyData>({
  type: STICKY_TYPE,

  schema: StickyDataSchema,
  currentVersion: STICKY_VERSION,
  migrations: {},

  create: (init) => ({
    data: { text: init?.text ?? '' },
    frame: { width: 180, height: 180 },
  }),

  capabilities: {
    resizable: true,
    rotatable: false,
    textEditable: true,
    canHaveChildren: false,
    connectable: true,
    styleProps: ['color', 'fill', 'font', 'align', 'opacity'],
  },

  describe: (object) => ({
    searchText: object.data.text,
    summary: object.data.text.trim() === '' ? 'Empty sticky note' : object.data.text.slice(0, 120),
    fields: { text: object.data.text },
  }),
})
