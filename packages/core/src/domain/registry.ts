import type { ZodType } from 'zod'

import { rotatedBounds, type Rect } from '../geometry/rect.js'
import type { AnyOpenFrameObject, ObjectBase, StyleProp } from './object.js'

/**
 * What an object type can do. The application asks the registry rather than
 * switching on `object.type`, which is how a selection of mixed types can be
 * styled, resized or described by code that knows nothing about any of them.
 */
export interface ObjectCapabilities {
  readonly resizable: boolean
  readonly rotatable: boolean
  readonly textEditable: boolean
  readonly canHaveChildren: boolean
  readonly connectable: boolean
  /** Which style tokens this type honours. Others are ignored, not rejected. */
  readonly styleProps: readonly StyleProp[]
}

/**
 * A type's own account of itself in plain text.
 *
 * This is the single seam that board search, AI context serialization, MCP
 * `get_objects` and export all read from. Without it, each of those features
 * grows its own `switch (object.type)` and adding an object type stops being a
 * two-file change.
 */
export interface ObjectDescription {
  /** Everything a user might search for, flattened. */
  readonly searchText: string
  /** One line, for AI context and list views. */
  readonly summary: string
  /** Named semantic fields, for structured consumers. */
  readonly fields: Readonly<Record<string, string | number | readonly string[]>>
}

export type ValidationResult =
  | { readonly ok: true; readonly data: unknown }
  | { readonly ok: false; readonly issues: readonly string[] }

/**
 * The typed definition an object type author writes.
 *
 * Note what is NOT here: no renderer, no editor, no icon, no React. Those live
 * in the web app's separate view registry (`apps/web/src/canvas/views`), keyed
 * by the same type string. The split is what keeps `@openframe/core` free of
 * React — and therefore keeps the renderer replaceable.
 */
export interface ObjectTypeDefinition<TType extends string, TData> {
  readonly type: TType

  /** Schema for `data` at `currentVersion`. */
  readonly schema: ZodType<TData>
  readonly currentVersion: number
  /**
   * Keyed by TARGET version: `migrations[2]` takes v1 data to v2 data.
   * Operates on `unknown` — never on the current `TData` — because a migration
   * that imports today's type silently changes meaning when that type changes.
   */
  readonly migrations: Readonly<Record<number, (data: unknown) => unknown>>

  /** The one place defaults live, shared by the UI, AI, importers and the API. */
  readonly create: (init?: Partial<TData>) => {
    data: TData
    frame: { width: number; height: number }
  }

  readonly capabilities: ObjectCapabilities

  /** Only for types whose bounds are not their frame. Most types omit this. */
  readonly getBounds?: (object: ObjectBase<TType, TData>) => Rect

  readonly describe: (object: ObjectBase<TType, TData>) => ObjectDescription
}

/**
 * The type-erased definition the rest of the system consumes.
 *
 * Generic code holds these; it can validate, migrate, instantiate and describe
 * any object without knowing its payload shape.
 */
export interface ErasedObjectTypeDefinition {
  readonly type: string
  readonly currentVersion: number
  readonly capabilities: ObjectCapabilities
  readonly validate: (data: unknown) => ValidationResult
  readonly migrate: (data: unknown, fromVersion: number) => unknown
  readonly create: (init?: Record<string, unknown>) => {
    data: unknown
    frame: { width: number; height: number }
  }
  readonly describe: (object: AnyOpenFrameObject) => ObjectDescription
  readonly getBounds?: (object: AnyOpenFrameObject) => Rect
}

export class ObjectTypeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ObjectTypeError'
  }
}

/**
 * Erases a typed definition for storage in the registry.
 *
 * This function contains the ONLY casts in the domain layer. They are safe
 * because the registry guarantees a definition is never handed an object of a
 * different `type`, and they are confined here so that authors keep full type
 * safety while consumers keep a uniform interface.
 */
export function defineObjectType<TType extends string, TData>(
  definition: ObjectTypeDefinition<TType, TData>,
): ErasedObjectTypeDefinition {
  const erased: ErasedObjectTypeDefinition = {
    type: definition.type,
    currentVersion: definition.currentVersion,
    capabilities: definition.capabilities,

    validate: (data) => {
      const result = definition.schema.safeParse(data)
      return result.success
        ? { ok: true, data: result.data }
        : { ok: false, issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }
    },

    migrate: (data, fromVersion) => {
      if (fromVersion > definition.currentVersion) {
        throw new ObjectTypeError(
          `Object type "${definition.type}" data is version ${fromVersion}, newer than the supported ${definition.currentVersion}`,
        )
      }
      let current = data
      for (let target = fromVersion + 1; target <= definition.currentVersion; target++) {
        const migration = definition.migrations[target]
        if (migration === undefined) {
          throw new ObjectTypeError(
            `Object type "${definition.type}" is missing a migration to version ${target}`,
          )
        }
        current = migration(current)
      }
      return current
    },

    create: (init) => definition.create(init as Partial<TData> | undefined),

    describe: (object) => definition.describe(object as ObjectBase<TType, TData>),
  }

  const { getBounds } = definition
  if (getBounds !== undefined) {
    return { ...erased, getBounds: (object) => getBounds(object as ObjectBase<TType, TData>) }
  }
  return erased
}

/**
 * The set of object types this build of OpenFrame understands.
 *
 * Constructed at the composition root and passed down. It is not a module-level
 * singleton: tests build their own registries, and a future MCP server or
 * importer may run with a different set.
 */
export class ObjectTypeRegistry {
  readonly #definitions = new Map<string, ErasedObjectTypeDefinition>()

  constructor(definitions: readonly ErasedObjectTypeDefinition[] = []) {
    for (const definition of definitions) this.register(definition)
  }

  register(definition: ErasedObjectTypeDefinition): void {
    if (this.#definitions.has(definition.type)) {
      throw new ObjectTypeError(`Object type "${definition.type}" is already registered`)
    }
    this.#definitions.set(definition.type, definition)
  }

  has(type: string): boolean {
    return this.#definitions.has(type)
  }

  get(type: string): ErasedObjectTypeDefinition | undefined {
    return this.#definitions.get(type)
  }

  /** For call sites where an unknown type is a programming error, not bad data. */
  require(type: string): ErasedObjectTypeDefinition {
    const definition = this.#definitions.get(type)
    if (definition === undefined) {
      throw new ObjectTypeError(`Object type "${type}" is not registered`)
    }
    return definition
  }

  list(): ErasedObjectTypeDefinition[] {
    return [...this.#definitions.values()]
  }

  /** Bounds for hit testing and culling, defaulting to the object's frame. */
  /**
   * The axis-aligned bounds used for culling, hit-test prefiltering and marquee
   * selection. Rotation is accounted for here so that every consumer gets the
   * rotated extent without knowing rotation exists.
   */
  boundsOf(object: AnyOpenFrameObject): Rect {
    const custom = this.#definitions.get(object.type)?.getBounds?.(object)
    if (custom !== undefined) return custom
    const { x, y, width, height, rotation } = object.frame
    return rotatedBounds({ x, y, width, height }, rotation)
  }
}
