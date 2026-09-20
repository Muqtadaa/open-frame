import { defineObjectType } from '../../domain/registry.js'
import { FRAME_VERSION, FrameDataSchema, type FrameData } from './schema.js'

export const FRAME_TYPE = 'frame'

export const frameType = defineObjectType<typeof FRAME_TYPE, FrameData>({
  type: FRAME_TYPE,

  schema: FrameDataSchema,
  currentVersion: FRAME_VERSION,
  migrations: {},

  create: (init) => ({
    data: { name: init?.name ?? 'Frame' },
    frame: { width: 640, height: 420 },
  }),

  capabilities: {
    resizable: true,
    // Rotating a container would rotate the coordinate space its children are
    // positioned in. Not worth the complexity for a feature nobody asks for.
    rotatable: false,
    textEditable: true,
    spatial: true,
    canHaveChildren: true,
    selectsAsUnit: false,
    connectable: true,
    styleProps: ['color', 'textColor', 'fill', 'opacity'],
  },

  describe: (object) => ({
    searchText: object.data.name,
    summary: `Frame: ${object.data.name}`,
    fields: { name: object.data.name },
  }),
})
