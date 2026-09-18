import { defineObjectType } from '../../domain/registry.js'
import { inflate, rectFromPoints } from '../../geometry/rect.js'
import { distanceToSegment } from '../../geometry/point.js'
import { endpointDependencies, resolveEndpoints } from './geometry.js'
import { CONNECTOR_VERSION, ConnectorDataSchema, type ConnectorData } from './schema.js'

export const CONNECTOR_TYPE = 'connector'

/** Padding so a thin diagonal line is still comfortably clickable. */
const HIT_PADDING = 6

export const connectorType = defineObjectType<typeof CONNECTOR_TYPE, ConnectorData>({
  type: CONNECTOR_TYPE,

  schema: ConnectorDataSchema,
  currentVersion: CONNECTOR_VERSION,
  migrations: {},

  create: (init) => ({
    data: {
      from: init?.from ?? { kind: 'point', x: 0, y: 0 },
      to: init?.to ?? { kind: 'point', x: 100, y: 0 },
      routing: init?.routing ?? 'straight',
      startArrow: init?.startArrow ?? 'none',
      endArrow: init?.endArrow ?? 'arrow',
      text: init?.text ?? '',
    },
    // A connector has no meaningful frame — its extent is wherever its ends
    // resolve to. `getBounds` supplies the real answer.
    frame: { width: 0, height: 0 },
  }),

  capabilities: {
    // Resized and rotated by moving its ENDS, not by handles on a box.
    resizable: false,
    rotatable: false,
    textEditable: true,
    canHaveChildren: false,
    connectable: false,
    styleProps: ['color', 'stroke', 'opacity'],
  },

  /**
   * Bounds come from the resolved endpoints, not from `frame`.
   *
   * This is why `getBounds` receives the document: a connector's extent depends
   * on objects it merely references, and culling, hit testing and zoom-to-fit
   * all need the real answer.
   */
  getBounds: (object, doc) => {
    const { start, end } = resolveEndpoints(doc, object.data.from, object.data.to)
    return inflate(rectFromPoints(start, end), HIT_PADDING)
  },

  /**
   * Hit within a few units of the LINE, not anywhere in the bounding rectangle.
   * Bounds containment would make clicking the empty space between two
   * connected objects select the connector joining them.
   */
  hitTest: (object, doc, point) => {
    const { start, end } = resolveEndpoints(doc, object.data.from, object.data.to)
    return distanceToSegment(point, start, end) <= HIT_PADDING * 2
  },

  /** Redraw when either end moves. */
  dependencies: (object) => endpointDependencies(object.data.from, object.data.to),

  describe: (object) => ({
    searchText: object.data.text,
    summary: object.data.text.trim() === '' ? 'Connector' : `Connector: ${object.data.text}`,
    fields: { text: object.data.text, routing: object.data.routing },
  }),
})
