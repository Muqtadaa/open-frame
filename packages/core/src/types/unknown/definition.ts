import { defineObjectType } from '../../domain/registry.js'
import { UNKNOWN_VERSION, UnknownDataSchema, type UnknownData } from './schema.js'

export const UNKNOWN_TYPE = 'unknown'

/**
 * A type's identifier as words: `kanban-card` is "Kanban card".
 *
 * The identifier is all a build knows about a type from a newer one, and it
 * was shown as is — an identifier, on a board, to somebody who never chose it.
 */
export function readableTypeName(type: string): string {
  const words = type
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[-_\s]+/)
    .filter((word) => word !== '')
    .map((word) => word.toLowerCase())
    .join(' ')
  return words === '' ? 'Object' : words.charAt(0).toUpperCase() + words.slice(1)
}

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
    spatial: true,
    canHaveChildren: false,
    selectsAsUnit: false,
    connectable: false,
    styleProps: [],
  },

  describe: (object) => {
    const name = readableTypeName(object.data.originalType)
    return {
      searchText: '',
      summary: `${name} (from a newer version of OpenFrame)`,
      gist: `${name}, from a newer version of OpenFrame`,
      fields: { originalType: object.data.originalType },
      cannotEdit: `This ${name.toLowerCase()} was made in a newer version of OpenFrame. It can be moved or deleted here, and opened there.`,
    }
  },
})
