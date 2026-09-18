import { ObjectTypeRegistry } from '../domain/registry.js'
import { connectorType } from './connector/definition.js'
import { frameType } from './frame/definition.js'
import { groupType } from './group/definition.js'
import { imageType } from './image/definition.js'
import { relationType } from './relation/definition.js'
import { shapeType } from './shape/definition.js'
import { stickyType } from './sticky/definition.js'
import { textType } from './text/definition.js'
import { unknownType } from './unknown/definition.js'

export { CONNECTOR_TYPE, connectorType } from './connector/definition.js'
export {
  ARROWHEADS,
  ConnectorDataSchema,
  ROUTINGS,
  type Anchor,
  type Arrowhead,
  type ConnectorData,
  type ConnectorEndpoint,
  type Routing,
} from './connector/schema.js'
export { endpointDependencies, resolveEndpoints } from './connector/geometry.js'
export { FRAME_TYPE, frameType } from './frame/definition.js'
export { GROUP_TYPE, groupType } from './group/definition.js'
export { RELATION_TYPE, relationType } from './relation/definition.js'
export { RelationDataSchema, type RelationData } from './relation/schema.js'
export { GroupDataSchema, type GroupData } from './group/schema.js'
export { IMAGE_TYPE, imageType, placedSize } from './image/definition.js'
export { ImageDataSchema, type ImageData } from './image/schema.js'
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
    groupType,
    relationType,
    unknownType,
  ])
}
