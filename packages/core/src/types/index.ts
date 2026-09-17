import { ObjectTypeRegistry } from '../domain/registry.js'
import { stickyType } from './sticky/definition.js'
import { unknownType } from './unknown/definition.js'

export { STICKY_TYPE, stickyType } from './sticky/definition.js'
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
  return new ObjectTypeRegistry([stickyType, unknownType])
}
