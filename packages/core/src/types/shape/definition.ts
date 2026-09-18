import { defineObjectType } from '../../domain/registry.js'
import { SHAPE_VERSION, ShapeDataSchema, type ShapeData } from './schema.js'

export const SHAPE_TYPE = 'shape'

export const shapeType = defineObjectType<typeof SHAPE_TYPE, ShapeData>({
  type: SHAPE_TYPE,

  schema: ShapeDataSchema,
  currentVersion: SHAPE_VERSION,
  migrations: {},

  create: (init) => ({
    data: { shape: init?.shape ?? 'rectangle', text: init?.text ?? '' },
    frame: { width: 160, height: 120 },
  }),

  capabilities: {
    resizable: true,
    rotatable: true,
    textEditable: true,
    spatial: true,
    canHaveChildren: false,
    selectsAsUnit: false,
    connectable: true,
    styleProps: ['color', 'fill', 'stroke', 'font', 'align', 'opacity'],
  },

  describe: (object) => ({
    searchText: object.data.text,
    summary:
      object.data.text.trim() === ''
        ? `Empty ${object.data.shape}`
        : `${object.data.shape}: ${object.data.text.slice(0, 100)}`,
    fields: { shape: object.data.shape, text: object.data.text },
  }),
})
