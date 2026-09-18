import { defineObjectType } from '../../domain/registry.js'
import { UNKNOWN_VERSION, UnknownDataSchema, type UnknownData } from './schema.js'

export const UNKNOWN_TYPE = 'unknown'

export const unknownType = defineObjectType<typeof UNKNOWN_TYPE, UnknownData>({
  type: UNKNOWN_TYPE,

  schema: UnknownDataSchema,
  currentVersion: UNKNOWN_VERSION,
  migrations: {},

  create: (init) => ({
    data: {
      originalType: init?.originalType ?? 'unknown',
      originalVersion: init?.originalVersion ?? 0,
      raw: init?.raw,
    },
    frame: { width: 180, height: 120 },
  }),

  capabilities: {
    // Movable and deletable, but never editable: we must not corrupt a payload
    // we do not understand.
    resizable: false,
    rotatable: false,
    textEditable: false,
    canHaveChildren: false,
    selectsAsUnit: false,
    connectable: false,
    styleProps: [],
  },

  describe: (object) => ({
    searchText: '',
    summary: `Unsupported object (${object.data.originalType})`,
    fields: { originalType: object.data.originalType },
  }),
})
