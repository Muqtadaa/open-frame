import type { ObjectId, OrderKey, UserId } from './ids.js'
import type { AnyOpenFrameObject, ObjectStyle, Origin } from './object.js'
import type { ErasedObjectTypeDefinition } from './registry.js'

export interface InstantiateParams {
  readonly definition: ErasedObjectTypeDefinition
  readonly id: ObjectId
  readonly order: OrderKey
  readonly x: number
  readonly y: number
  readonly parentId?: ObjectId | null
  readonly width?: number
  readonly height?: number
  readonly style?: ObjectStyle
  readonly data?: Record<string, unknown>
  readonly createdAt: number
  readonly createdBy: UserId | null
  readonly createdVia: Origin
}

/**
 * Builds a complete object from a type definition.
 *
 * Every creation path — the toolbar, paste, import, AI, the future API and MCP
 * server — funnels through here, so defaults can never drift between them.
 */
export function instantiateObject(params: InstantiateParams): AnyOpenFrameObject {
  const { data, frame } = params.definition.create(params.data)
  return {
    id: params.id,
    type: params.definition.type,
    dataVersion: params.definition.currentVersion,
    frame: {
      x: params.x,
      y: params.y,
      width: params.width ?? frame.width,
      height: params.height ?? frame.height,
      rotation: 0,
    },
    parentId: params.parentId ?? null,
    order: params.order,
    style: params.style ?? {},
    locked: false,
    hidden: false,
    data,
    meta: {
      createdAt: params.createdAt,
      createdBy: params.createdBy,
      createdVia: params.createdVia,
    },
  }
}
