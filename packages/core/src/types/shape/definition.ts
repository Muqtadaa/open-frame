import { plainTextOf } from '../../domain/rich-text.js'
import { defineObjectType } from '../../domain/registry.js'
import { resizeTokens } from '../shared/resize-tokens.js'
import { textToSpans } from '../shared/text-to-spans.js'
import type { StyleProp } from '../../domain/object.js'
import {
  CORNERED_KINDS,
  SHAPE_VERSION,
  ShapeDataSchema,
  type ShapeData,
} from './schema.js'

export const SHAPE_TYPE = 'shape'

/*
 * Frozen and shared rather than built per call: the inspector compares what it
 * gets back, and a fresh array every render is a fresh reference every render.
 */
const WITH_CORNERS = Object.freeze([
  'color',
  'textColor',
  'fill',
  'stroke',
  'dash',
  'font',
  'align',
  'opacity',
  'radius',
] as const satisfies readonly StyleProp[])

const WITHOUT_CORNERS = Object.freeze(
  WITH_CORNERS.filter((prop) => prop !== 'radius') as readonly StyleProp[],
)

export const shapeType = defineObjectType<typeof SHAPE_TYPE, ShapeData>({
  type: SHAPE_TYPE,

  schema: ShapeDataSchema,
  currentVersion: SHAPE_VERSION,
  /*
   * v2: `text` was a plain string until spans (ADR 0012).
   * v3: the size scale widened, and its tokens were renamed.
   */
  migrations: { 2: textToSpans, 3: resizeTokens },

  create: (init) => ({
    data: { shape: init?.shape ?? 'rectangle', text: init?.text ?? [{ text: '' }] },
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
    styleProps: WITH_CORNERS,
  },

  /*
   * The ellipse has no corners, so it is not offered a corner radius.
   *
   * Declaring `radius` on the whole type and letting the ellipse ignore it is
   * the exact trap rule 21 records — `sticky` claimed a `fill` its view
   * ignored, and nothing noticed for as long as `color` was the only property
   * anything could set.
   */
  stylePropsFor: (object) => (CORNERED_KINDS[object.data.shape] ? WITH_CORNERS : WITHOUT_CORNERS),

  describe: (object) => {
    const text = plainTextOf(object.data.text)
    return {
      searchText: text,
      summary:
        text.trim() === ''
          ? `Empty ${object.data.shape}`
          : `${object.data.shape}: ${text.slice(0, 100)}`,
      fields: { shape: object.data.shape, text },
    }
  },
})
