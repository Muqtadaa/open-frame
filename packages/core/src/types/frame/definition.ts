import { defineObjectType } from '../../domain/registry.js'
import { plainTextOf, richFromPlain } from '../../domain/rich-text.js'
import { nameToText } from './name-to-text.js'
import { FRAME_VERSION, FrameDataSchema, type FrameData } from './schema.js'

export const FRAME_TYPE = 'frame'

export const frameType = defineObjectType<typeof FRAME_TYPE, FrameData>({
  type: FRAME_TYPE,

  schema: FrameDataSchema,
  currentVersion: FRAME_VERSION,
  migrations: { 2: nameToText },

  create: (init) => ({
    data: { name: init?.name ?? richFromPlain('Frame') },
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
    styleProps: ['color', 'textColor', 'strokeColor', 'fill', 'opacity'],
  },

  describe: (object) => {
    const name = plainTextOf(object.data.name)
    return { searchText: name, summary: `Frame: ${name}`, gist: name.trim(), fields: { name } }
  },
})
