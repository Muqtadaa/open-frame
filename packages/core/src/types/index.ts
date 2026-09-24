import { ObjectTypeRegistry } from '../domain/registry.js'
import { codeType } from './code/definition.js'
import { connectorType } from './connector/definition.js'
import { evidenceType } from './evidence/definition.js'
import { frameType } from './frame/definition.js'
import { groupType } from './group/definition.js'
import { imageType } from './image/definition.js'
import { insightType } from './insight/definition.js'
import { hypothesisType } from './hypothesis/definition.js'
import { experimentType } from './experiment/definition.js'
import { decisionType } from './decision/definition.js'
import { taskType } from './task/definition.js'
import { journeystageType } from './journey-stage/definition.js'
import { requirementType } from './requirement/definition.js'
import { relationType } from './relation/definition.js'
import { shapeType } from './shape/definition.js'
import { stickyType } from './sticky/definition.js'
import { tableType } from './table/definition.js'
import { textType } from './text/definition.js'
import { unknownType } from './unknown/definition.js'

export {
  canTidy,
  tidyCode,
  tidyKindOf,
  type TidyKind,
} from './code/format.js'
export { CODE_TYPE, codeType } from './code/definition.js'
export {
  CODE_LANGUAGES,
  CodeDataSchema,
  MAX_CODE,
  type CodeData,
} from './code/schema.js'

export { TABLE_TYPE, tableType } from './table/definition.js'
export {
  MAX_COLUMNS,
  MAX_ROWS,
  TableDataSchema,
  MIN_TRACK,
  CELL_STYLE_KEYS,
  cellIndex,
  cellRange,
  cellRegion,
  styleCells,
  emptyCells,
  dividerPositions,
  resizeTrackAt,
  setTrackSize,
  resizeGrid,
  type CellStyle,
  type TableCell,
  type TableData,
} from './table/schema.js'

export { CONNECTOR_TYPE, connectorType } from './connector/definition.js'
export {
  ARROWHEADS,
  ConnectorDataSchema,
  ROUTINGS,
  type Anchor,
  type Arrowhead,
  type Bend,
  type ConnectorData,
  type ConnectorEndpoint,
  type Routing,
} from './connector/schema.js'
export {
  attachmentAnchor,
  endpointDependencies,
  resolveEndpoints,
  type ResolvedEnds,
} from './connector/geometry.js'
export {
  bendAt,
  connectorRoute,
  flattenRoute,
  orthogonalLegs,
  orthogonalNodes,
  pointAt,
  routeMidpoint,
  routeNodes,
  routeSegments,
  routeStops,
  routeVertices,
  NO_BEND,
  type LegAnchor,
  type LegAxis,
  type Route,
  type RouteLeg,
  type RouteNormals,
  type RouteSegment,
} from './connector/route.js'
export { EVIDENCE_TYPE, evidenceType } from './evidence/definition.js'
export { EvidenceDataSchema, type EvidenceData } from './evidence/schema.js'
export { FRAME_TYPE, frameType } from './frame/definition.js'
export { GROUP_TYPE, groupType } from './group/definition.js'
export { RELATION_TYPE, relationType } from './relation/definition.js'
export { RelationDataSchema, type RelationData } from './relation/schema.js'
export { GroupDataSchema, type GroupData } from './group/schema.js'
export { IMAGE_TYPE, imageType, placedSize } from './image/definition.js'
export { INSIGHT_TYPE, insightType } from './insight/definition.js'
export { HYPOTHESIS_TYPE, hypothesisType } from './hypothesis/definition.js'
export * from './hypothesis/schema.js'
export { EXPERIMENT_TYPE, experimentType } from './experiment/definition.js'
export * from './experiment/schema.js'
export { DECISION_TYPE, decisionType } from './decision/definition.js'
export * from './decision/schema.js'
export { TASK_TYPE, taskType } from './task/definition.js'
export * from './task/schema.js'
export { JOURNEY_STAGE_TYPE, journeystageType } from './journey-stage/definition.js'
export * from './journey-stage/schema.js'
export { REQUIREMENT_TYPE, requirementType } from './requirement/definition.js'
export * from './requirement/schema.js'
export {
  CONFIDENCE_LEVELS,
  InsightDataSchema,
  type Confidence,
  type InsightData,
} from './insight/schema.js'
export { ImageDataSchema, type ImageCrop, type ImageData } from './image/schema.js'
export {
  cropByHandle,
  isCropped,
  uncrop,
  FULL_CROP,
  type CropBox,
  type CropHandle,
  type CropResult,
} from './image/crop.js'
export { FrameDataSchema, type FrameData } from './frame/schema.js'
export { SHAPE_TYPE, shapeType } from './shape/definition.js'
export { SHAPE_KINDS, ShapeDataSchema, type ShapeData, type ShapeKind } from './shape/schema.js'
export { STICKY_TYPE, stickyType } from './sticky/definition.js'
export { TEXT_TYPE, textType } from './text/definition.js'
export { TextDataSchema, type TextData } from './text/schema.js'
export { StickyDataSchema, type StickyData } from './sticky/schema.js'
export { UNKNOWN_TYPE, unknownType } from './unknown/definition.js'
export { UnknownDataSchema, type UnknownData } from './unknown/schema.js'

/**
 * The object types this build understands.
 *
 * Registering a new semantic type is a ONE-LINE change here plus a folder of
 * its own. Nothing in the command layer, persistence, undo, culling, hit
 * testing, search or serialization needs to know it exists.
 */
export function createDefaultRegistry(): ObjectTypeRegistry {
  return new ObjectTypeRegistry([
    stickyType,
    textType,
    shapeType,
    frameType,
    connectorType,
    imageType,
    tableType,
    codeType,
    groupType,
    evidenceType,
    insightType,
    hypothesisType,
    experimentType,
    decisionType,
    taskType,
    journeystageType,
    requirementType,
    relationType,
    unknownType,
  ])
}
