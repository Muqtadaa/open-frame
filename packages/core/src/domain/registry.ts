import type { ZodType } from 'zod'

import { containsRotatedPoint, rotatedBounds, type Rect } from '../geometry/rect.js'
import type { Point } from '../geometry/point.js'
import { groupByParent, type BoardDocument } from './document.js'
import type { ObjectId } from './ids.js'
import type { AnyOpenFrameObject, ObjectBase, StyleProp } from './object.js'

/**
 * What a container type is handed to work out its own extent.
 *
 * Both are supplied rather than reached for, and both are shared across one
 * bounds pass. `childrenOf` in particular: calling the document helper directly
 * would scan every object once PER CONTAINER, which on a board of 10,000
 * objects with 250 groups measured at 7.5ms of pure scanning per cull — half a
 * frame budget, spent before anything was drawn (rule 10).
 */
export interface BoundsContext {
  readonly boundsOf: (other: AnyOpenFrameObject) => Rect
  readonly childrenOf: (parentId: ObjectId) => readonly AnyOpenFrameObject[]
}

/**
 * One draggable end of an object, in world coordinates.
 *
 * `id` is the type's own name for it (`'from'` / `'to'` for a connector) and is
 * passed straight back to `retargetEndpoint`, so the generic layer never has to
 * know what ends a type has.
 */
export interface DraggableEndpoint {
  readonly id: string
  readonly at: Point
  /** The object this end is currently attached to, if any. */
  readonly attachedTo?: ObjectId
}

/**
 * What a dragged endpoint was dropped on: empty space, or an object.
 *
 * Deliberately free of anchor detail. Where exactly on the target an
 * attachment lands is the TYPE's decision, not the gesture's.
 */
export type EndpointTarget =
  | { readonly kind: 'point'; readonly x: number; readonly y: number }
  | { readonly kind: 'object'; readonly objectId: ObjectId }

/**
 * What an object type can do. The application asks the registry rather than
 * switching on `object.type`, which is how a selection of mixed types can be
 * styled, resized or described by code that knows nothing about any of them.
 */
/** Nesting beyond this is a malformed document, not a board someone built. */
const MAX_BOUNDS_DEPTH = 32

export interface ObjectCapabilities {
  readonly resizable: boolean
  readonly rotatable: boolean
  readonly textEditable: boolean
  readonly canHaveChildren: boolean
  /**
   * Clicking a DESCENDANT selects this object instead.
   *
   * What makes a group a group. A frame deliberately does not do this: clicking
   * a note inside a frame selects the note, because a frame organises the board
   * while a group is meant to behave as one thing.
   */
  readonly selectsAsUnit: boolean
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

  /**
   * Only for types whose bounds are not their frame.
   *
   * Receives the document because some bounds depend on OTHER objects — a
   * connector's extent is wherever its endpoints resolve to, and it has no
   * meaningful frame of its own.
   */
  readonly getBounds?: (
    object: ObjectBase<TType, TData>,
    doc: BoardDocument,
    /**
     * Helpers for container types whose extent is their children's, so a
     * container needs to know neither how another type computes its extent nor
     * how to find its own members efficiently.
     */
    context: BoundsContext,
  ) => Rect

  /**
   * Precise containment, for types whose BOUNDS are much larger than their ink.
   *
   * A connector's bounds are the rectangle spanning its endpoints, so bounds
   * containment alone would select it from anywhere in that rectangle —
   * including the empty space between the two objects it joins. Types that omit
   * this are hit-tested by their bounds, which is right for anything solid.
   */
  readonly hitTest?: (object: ObjectBase<TType, TData>, doc: BoardDocument, point: Point) => boolean

  /**
   * Other objects this one's geometry or rendering depends on.
   *
   * The renderer subscribes to these as well as to the object itself, so a
   * connector redraws when either end moves. Without it, per-object
   * subscriptions — which are what keep a large board fast — would leave
   * dependent objects stale.
   */
  readonly dependencies?: (object: ObjectBase<TType, TData>) => readonly ObjectId[]

  /**
   * Individually draggable points, for types whose SHAPE is defined by where
   * its ends are rather than by a frame.
   *
   * Declared here rather than detected by the overlay, for the same reason as
   * `getBounds`: `object.type === 'connector'` in a caller is the type switch
   * rule 5 forbids, and it would have to be extended for every later type with
   * ends — a dimension line, a curve with control points, a route with stops.
   */
  readonly endpoints?: (
    object: ObjectBase<TType, TData>,
    doc: BoardDocument,
  ) => readonly DraggableEndpoint[]

  /**
   * Where a dragged endpoint ends up, as a data patch.
   *
   * The TYPE decides what attaching means — which anchor to use, whether an
   * attachment is allowed at all — so the gesture only reports what was dropped
   * on and lets the type work out the rest.
   */
  readonly retargetEndpoint?: (
    object: ObjectBase<TType, TData>,
    endpointId: string,
    target: EndpointTarget,
  ) => Partial<TData>

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
  readonly getBounds?: (
    object: AnyOpenFrameObject,
    doc: BoardDocument,
    context: BoundsContext,
  ) => Rect
  readonly hitTest?: (object: AnyOpenFrameObject, doc: BoardDocument, point: Point) => boolean
  readonly dependencies?: (object: AnyOpenFrameObject) => readonly ObjectId[]
  readonly endpoints?: (object: AnyOpenFrameObject, doc: BoardDocument) => readonly DraggableEndpoint[]
  readonly retargetEndpoint?: (
    object: AnyOpenFrameObject,
    endpointId: string,
    target: EndpointTarget,
  ) => Record<string, unknown>
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

  const { getBounds, hitTest, dependencies, endpoints, retargetEndpoint } = definition
  return {
    ...erased,
    ...(getBounds === undefined
      ? {}
      : {
          getBounds: (object, doc, context) =>
            getBounds(object as ObjectBase<TType, TData>, doc, context),
        }),
    ...(hitTest === undefined
      ? {}
      : {
          hitTest: (object, doc, point) => hitTest(object as ObjectBase<TType, TData>, doc, point),
        }),
    ...(dependencies === undefined
      ? {}
      : { dependencies: (object) => dependencies(object as ObjectBase<TType, TData>) }),
    ...(endpoints === undefined
      ? {}
      : { endpoints: (object, doc) => endpoints(object as ObjectBase<TType, TData>, doc) }),
    ...(retargetEndpoint === undefined
      ? {}
      : {
          retargetEndpoint: (object, endpointId, target) =>
            retargetEndpoint(object as ObjectBase<TType, TData>, endpointId, target),
        }),
  }
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
  /** One-entry cache for `#childIndexFor`, keyed by document identity. */
  #childIndexDoc: BoardDocument | undefined
  #childIndex: Map<ObjectId | null, AnyOpenFrameObject[]> | undefined

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

  /**
   * Precise containment. Falls back to bounds for types that do not define it.
   * Callers should reject on bounds first; this is the expensive, exact answer.
   */
  hitTestObject(object: AnyOpenFrameObject, doc: BoardDocument, point: Point): boolean {
    const precise = this.#definitions.get(object.type)?.hitTest
    if (precise !== undefined) return precise(object, doc, point)
    const { x, y, width, height } = object.frame
    return containsRotatedPoint({ x, y, width, height }, object.frame.rotation, point)
  }

  /**
   * The draggable ends of an object, or none for types that have no such thing.
   * Empty for almost everything, which is what lets the overlay ask every
   * selected object without caring what it is.
   */
  endpointsOf(object: AnyOpenFrameObject, doc: BoardDocument): readonly DraggableEndpoint[] {
    return this.#definitions.get(object.type)?.endpoints?.(object, doc) ?? []
  }

  /**
   * The data patch that moves one endpoint, or `null` if the type does not
   * support it. Null rather than an empty patch, so a caller can tell "nothing
   * to do" from "this type cannot".
   */
  retargetEndpoint(
    object: AnyOpenFrameObject,
    endpointId: string,
    target: EndpointTarget,
  ): Record<string, unknown> | null {
    const retarget = this.#definitions.get(object.type)?.retargetEndpoint
    return retarget === undefined ? null : retarget(object, endpointId, target)
  }

  /** Objects whose rendering depends on this one — the reverse of `dependencies`. */
  dependenciesOf(object: AnyOpenFrameObject): readonly ObjectId[] {
    return this.#definitions.get(object.type)?.dependencies?.(object) ?? []
  }

  /** Bounds for hit testing and culling, defaulting to the object's frame. */
  /**
   * The axis-aligned bounds used for culling, hit-test prefiltering and marquee
   * selection. Rotation is accounted for here so that every consumer gets the
   * rotated extent without knowing rotation exists.
   */
  boundsOf(object: AnyOpenFrameObject, doc: BoardDocument): Rect {
    return this.#boundsOf(object, doc, 0)
  }

  /**
   * Children by parent, built once per document.
   *
   * The document is immutable and replaced wholesale on every change, so its
   * identity is an exact invalidation key — a stale index is not reachable. One
   * entry is enough: bounds passes run over one document at a time, and a
   * caller alternating between two would merely rebuild, never answer wrongly.
   */
  #childIndexFor(doc: BoardDocument): Map<ObjectId | null, AnyOpenFrameObject[]> {
    if (this.#childIndexDoc !== doc || this.#childIndex === undefined) {
      this.#childIndex = groupByParent(doc)
      this.#childIndexDoc = doc
    }
    return this.#childIndex
  }

  /**
   * `depth` guards the container case. A group's bounds are its children's, so a
   * parent chain that somehow formed a cycle would recurse forever. The command
   * layer's `wouldCreateCycle` is what should prevent that; this is the belt to
   * its braces, because the failure mode is a hung renderer rather than a wrong
   * rectangle.
   */
  #boundsOf(object: AnyOpenFrameObject, doc: BoardDocument, depth: number): Rect {
    const custom =
      depth >= MAX_BOUNDS_DEPTH
        ? undefined
        : this.#definitions.get(object.type)?.getBounds?.(object, doc, {
            boundsOf: (other) => this.#boundsOf(other, doc, depth + 1),
            childrenOf: (parentId) => this.#childIndexFor(doc).get(parentId) ?? [],
          })
    if (custom !== undefined) return custom
    const { x, y, width, height, rotation } = object.frame
    return rotatedBounds({ x, y, width, height }, rotation)
  }
}
