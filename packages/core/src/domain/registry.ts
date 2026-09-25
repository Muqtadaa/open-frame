import type { ZodType } from 'zod'

import { containsRotatedPoint, rotatedBounds, type Rect } from '../geometry/rect.js'
import type { Point } from '../geometry/point.js'
import { groupByParent, type BoardDocument } from './document.js'
import type { ObjectId } from './ids.js'
import type { AnyOpenFrameObject, ObjectBase, StyleProp } from './object.js'

/**
 * One directed, named link between two objects.
 *
 * Declared by the TYPE rather than detected by the index, so a later type that
 * also relates things — a comment that answers another comment, say — joins the
 * same index without the registry learning its name.
 */
export interface RelationEdge {
  readonly from: ObjectId
  readonly to: ObjectId
  readonly predicate: string
}

/**
 * Something that can be made FROM an object of some type.
 *
 * `predicate` is the relation the new object will carry back to the one it was
 * drawn from, so the vocabulary lives beside the pairing it belongs to rather
 * than being chosen by whatever code happens to create the relation.
 */
export interface Derivation {
  readonly type: string
  readonly predicate: string
}

/** A relation as seen from one end: the edge, and the object carrying it. */
export interface RelationLink {
  readonly id: ObjectId
  readonly edge: RelationEdge
}

interface RelationIndex {
  readonly outgoing: Map<ObjectId, RelationLink[]>
  readonly incoming: Map<ObjectId, RelationLink[]>
}

/**
 * What a type is handed when its geometry depends on ANOTHER object.
 *
 * Supplied rather than reached for, and shared across one pass: a type has no
 * registry of its own, and the alternative — reading `other.frame` — is the
 * answer that is right about a note and wrong about everything whose extent is
 * derived.
 */
export interface GeometryContext {
  /**
   * The real extent of another object, whatever its type keeps it in.
   *
   * A group's `frame` is 0x0 and its extent is its children's union; a
   * connector has no meaningful frame at all. Anything that needs to know
   * where another object's EDGES are has to ask this rather than read a frame
   * — which is rule 16, and which the connector's own anchors got wrong: a
   * line attached to a group resolved to the group's frame origin, so it ran
   * to a corner of the board instead of to the thing it was joined to.
   */
  readonly boundsOf: (other: AnyOpenFrameObject) => Rect
}

/**
 * And what a CONTAINER type is handed to work out its own extent: the above,
 * plus its members.
 *
 * `childrenOf` is shared across one bounds pass for a reason — calling the
 * document helper directly would scan every object once PER CONTAINER, which
 * on a board of 10,000 objects with 250 groups measured at 7.5ms of pure
 * scanning per cull: half a frame budget, spent before anything was drawn
 * (rule 10).
 */
export interface BoundsContext extends GeometryContext {
  readonly childrenOf: (parentId: ObjectId) => readonly AnyOpenFrameObject[]
}

/**
 * One draggable end of an object, in world coordinates.
 *
 * `id` is the type's own name for it (`'from'` / `'to'` for a connector) and is
 * passed straight back to `retargetEndpoint`, so the generic layer never has to
 * know what ends a type has.
 */
/**
 * A movable division INSIDE an object — a table's column and row boundaries.
 *
 * The same idea as `DraggableEndpoint` and for the same reason: an overlay that
 * asked `object.type === 'table'` would be the type switch rule 5 forbids, and
 * it would have to be extended for every later type with internal divisions.
 *
 * `at` is a FRACTION of the object's extent along `axis`, not a coordinate.
 * The overlay draws it against whatever bounds the object currently has, so a
 * type never has to know where on the board it is, and the same number is
 * meaningful before and after a resize.
 */
export interface DraggableDivider {
  readonly id: string
  readonly axis: 'x' | 'y'
  /** Where along that axis, as 0..1 of the object's extent. */
  readonly at: number
}

/** What moving a divider produces: new data, and the size that data needs. */
export interface DividerMove<TData> {
  readonly data: Partial<TData>
  readonly grow: { readonly width: number; readonly height: number }
}

/** What fraction of a type's content is on show. */
export interface CropWindow {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface DraggableEndpoint {
  readonly id: string
  readonly at: Point
  /** The object this end is currently attached to, if any. */
  readonly attachedTo?: ObjectId
  /**
   * What kind of point this is, so the overlay can draw it differently.
   *
   * An `end` decides where the shape STARTS or STOPS; a `control` only shapes
   * what runs between them. Drawn identically they read as three ends, and a
   * user drags the middle one expecting the line to detach there.
   */
  readonly role?: 'end' | 'control'
  /**
   * The handle this one HANDS OVER TO once it has been dragged.
   *
   * A handle that creates something cannot go on creating it. The midpoint of
   * a connector's segment adds a vertex the first time it is moved; asked a
   * second time it would add another, because the preview it produced is fed
   * straight back to it and index three of a four-point route is not the same
   * place it was. Declaring the successor lets the gesture follow without
   * knowing what either handle means — it drags this one, and from the first
   * move onwards it drags that one.
   */
  readonly becomes?: string
  /**
   * The stretch this handle is GRABBED ALONG, rather than at a point.
   *
   * A connector's leg is slid sideways by taking hold of it anywhere, which is
   * the gesture the shape asks for — you push a line out of the way, you do
   * not aim at a dot on it. The overlay draws a thin strip between these two
   * points instead of a square, and `at` stays the middle of it so anything
   * that only wants somewhere to point still has an answer.
   */
  readonly grip?: readonly [Point, Point]
  /**
   * A stretch of the object this handle only appears NEAR, in world units.
   *
   * Every segment of a route offers a midpoint to drag, and drawn all at once
   * they turn a line into a row of dots that hides the line. Declared as the
   * stretch rather than as a radius because "near" means near the piece this
   * handle would change, not near where the handle happens to sit: on a long
   * leg those are half a leg apart, and a handle you have to hunt for is one
   * nobody finds. Absent means always shown.
   */
  readonly shownNear?: readonly Point[]
}

/**
 * What a dragged endpoint was dropped on: empty space, or an object.
 *
 * Deliberately free of anchor detail. Where exactly on the target an
 * attachment lands is the TYPE's decision, not the gesture's.
 */
export type EndpointTarget =
  /**
   * The point is on BOTH, which is not redundant. A type that attaches cares
   * only which object was under the pointer; a type whose dragged point
   * attaches to nothing — a bend, a control point — needs where the pointer
   * actually was, and objects cover most of a working board.
   *
   * `tolerance` is on both for the same reason: it describes the DROP, not
   * what the drop landed on. It is how close counts, in world units — which
   * only the view can know, because a pointer is no more precise at 25% than
   * at 400% while a world unit is sixteen times as far. What "close" is close
   * TO is the type's business: an anchor to aim at for one end, the shape a
   * route collapses to for a control point.
   *
   * `final` says whether this is the RELEASE or another preview frame, and it
   * is on both for the same reason again: it describes the drop. Almost
   * nothing needs it, because a preview that answered differently from the
   * commit would be a preview that lied — but a change that cannot be undrawn
   * does: a connector's stop dragged onto its neighbour is snapped onto it
   * while the pointer is down and only taken OUT of the list on release,
   * because removing it a frame earlier would shift every index after it and
   * the drag would silently continue on a different point.
   */
  | {
      readonly kind: 'point'
      readonly x: number
      readonly y: number
      readonly tolerance: number
      readonly final: boolean
    }
  | {
      readonly kind: 'object'
      readonly objectId: ObjectId
      readonly x: number
      readonly y: number
      readonly tolerance: number
      readonly final: boolean
    }

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
  /**
   * Whether this type occupies a place on the board.
   *
   * A relation joins two objects and has no geometry of its own. Without this,
   * it would be culled, hit-tested and — worst — swept up by a marquee, so
   * dragging a box across a region would silently select invisible objects and
   * deleting that selection would silently destroy them.
   *
   * A capability rather than a check for `type === 'relation'`, per rule 18.
   */
  readonly spatial: boolean
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

/**
 * How a semantic field is edited, and therefore what shape its value has.
 *
 * Deliberately small. Each kind exists because a shipped type uses it, and a
 * kind nothing uses is a control nobody has ever seen render — which is how
 * `sticky` came to declare a `fill` its view ignored (rule 21).
 */
export type FieldKind = 'text' | 'longText' | 'tags' | 'select'

/**
 * One editable field on an object's `data`, declared by the type.
 *
 * The inspector reads these instead of enumerating fields itself. A panel that
 * knew evidence had a `participant` would be a second source of truth about
 * what a type can do, and it would drift the first time the type changed
 * (rule 21) — the same reason `styleProps` is a declaration rather than a list
 * in the panel.
 *
 * `key` addresses `data[key]` directly rather than a path. A nested field would
 * need a path language here, a patch that can address one, and a migration
 * story for the nesting; none of the eight structured types needs one, so the
 * flat key stays until something genuinely does.
 */
/**
 * Something a type can DO to an object, offered as a button.
 *
 * Declared here for the same reason a field is (rule 21): a panel that knew a
 * connector could be reset would be a second source of truth about what a type
 * can do, and the next type with something to offer would need the panel
 * edited rather than itself.
 *
 * `applies` is what keeps a button honest. A control that is always there and
 * usually does nothing teaches people to ignore it — so a line with no stops
 * on it offers no reset, and the button appears exactly when pressing it would
 * change something.
 *
 * `apply` returns a data patch and nothing else, so the action goes through
 * the same command, the same validation and the same undo entry as any other
 * edit (rule 3). An action that reached for the document could not.
 */
export interface ActionDefinition<TData> {
  readonly id: string
  /** Shown on the button. Sentence case, and a verb: it does something. */
  readonly label: string
  readonly applies?: (object: ObjectBase<string, TData>) => boolean
  readonly apply: (object: ObjectBase<string, TData>) => Partial<TData>
}

/** An action as the interface sees it, with the type erased away. */
export interface OfferedAction {
  readonly id: string
  readonly label: string
}

export interface FieldDefinition {
  readonly key: string
  /** Shown beside the control. Sentence case, because it is a label, not a heading. */
  readonly label: string
  readonly kind: FieldKind
  /**
   * What the field is ABOUT, and required so every type has to say.
   *
   * `record` is what the object says — a source, a participant, a status, an
   * image's alt text. `shape` is how it is drawn — a connector's route and its
   * arrowheads. The record panel names the first as the object's record and
   * files the second with its appearance: filing a line's arrowheads under
   * "record" made the one section meant to show what an object MEANS hold
   * geometry, and made a connector fold its styling away like evidence does.
   */
  readonly meaning: 'record' | 'shape'
  /** Only for `select`, and the only values its schema accepts. */
  readonly options?: readonly string[]
  /**
   * Shown in an empty control. This is where a type says what it MEANS by a
   * field — "P07", not "Enter participant" — because the label already said the
   * name and the example is what makes the distinction legible.
   */
  readonly placeholder?: string
  /**
   * Whether an empty value is meaningful.
   *
   * Never enforced as "you may not save": structure is earned, not demanded
   * (PRODUCT.md principle 2). A user drops an evidence card with nothing but a
   * quote and fills the source in later. This marks what is INCOMPLETE, for a
   * panel that wants to show it and for a future filter, and nothing rejects.
   */
  readonly essential?: boolean
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
   *
   * The object's stored style comes second, READ-ONLY: a migration may move
   * something out of style into data (a connector's whole-label bold became
   * marks on its label, ADR 0014), but never writes style, which has always
   * passed keys it does not know straight through.
   */
  readonly migrations: Readonly<
    Record<number, (data: unknown, style: Readonly<Record<string, unknown>>) => unknown>
  >

  /** The one place defaults live, shared by the UI, AI, importers and the API. */
  readonly create: (init?: Partial<TData>) => {
    data: TData
    frame: { width: number; height: number }
  }

  readonly capabilities: ObjectCapabilities
  /**
   * Narrows `capabilities.styleProps` for ONE object.
   *
   * Absent means no narrowing, which is what every type did before this
   * existed — and that default is safe in a way a defaulted CAPABILITY is not
   * (rule 18). A capability that defaults grants behaviour nobody chose; this
   * only ever takes a control AWAY, and taking none away is the status quo.
   *
   * It exists because `shape` is one type with a kind discriminant, and a
   * corner radius means nothing on an ellipse. Declaring `radius` on the type
   * and letting the ellipse ignore it is exactly the trap rule 21 records:
   * `sticky` claimed a `fill` its view ignored, invisible for as long as
   * nothing else could set it.
   */
  readonly stylePropsFor?: (object: ObjectBase<TType, TData>) => readonly StyleProp[]

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
  readonly hitTest?: (
    object: ObjectBase<TType, TData>,
    doc: BoardDocument,
    point: Point,
    context: GeometryContext,
  ) => boolean

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
    context: GeometryContext,
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
    doc: BoardDocument,
    endpointId: string,
    target: EndpointTarget,
    context: GeometryContext,
  ) => Partial<TData>

  /**
   * The movable divisions inside this object, if it has any.
   *
   * Empty for almost everything, which is what lets the overlay ask every
   * selected object without caring what it is.
   */
  readonly dividers?: (object: ObjectBase<TType, TData>) => readonly DraggableDivider[]

  /**
   * The part of this object's content currently shown, for types that hold
   * more than they display.
   *
   * An OPTIONAL MEMBER rather than a capability, for the same reason
   * `dividers` and `endpoints` are: a capability is a question every type must
   * answer (rule 18), and "can you be cropped" is not a question a connector
   * or a sticky note has an interesting answer to. Declaring this is what
   * gives a type crop handles; declaring nothing is what makes the overlay
   * skip it without knowing why.
   */
  readonly cropWindow?: (object: ObjectBase<TType, TData>) => CropWindow

  /**
   * Where a dragged divider ends up: a data patch, and how much bigger the
   * object has to be to hold it.
   *
   * `to` is a fraction of the object's extent, exactly as `at` was. The TYPE
   * decides what moving one means — a table sets the track before the boundary
   * to the size the pointer asks for and leaves every other track alone, which
   * is why the object itself has to grow or shrink.
   *
   * `grow` is a DELTA on the frame, in world units, and is usually zero on one
   * axis: dragging a column boundary changes a table's width and never its
   * height. The caller applies it as a resize in the same transaction as the
   * data, so the pair is one undoable action.
   */
  readonly moveDivider?: (
    object: ObjectBase<TType, TData>,
    dividerId: string,
    to: number,
  ) => DividerMove<TData> | null

  /**
   * The link this object represents, if it represents one.
   *
   * ADR 0011: a relation is an object, so adding one is an `add` patch that
   * commutes with any other. An array of ids inside `data` would be a whole-array
   * `set`, and two people citing the same insight concurrently would lose one of
   * the citations.
   */
  readonly relation?: (object: ObjectBase<TType, TData>) => RelationEdge | null

  /**
   * The editable semantic fields of this type, in the order they are presented.
   *
   * Omitted by types whose content is not a record — a sticky's text is edited
   * on the canvas, where it is, rather than in a panel away from it.
   *
   * Every key here MUST be accepted by `schema`, which the registry contract
   * test proves by round-tripping a value through `validate` for each one. A
   * declared field the schema rejects is a control that silently fails to save.
   */
  readonly fields?: readonly FieldDefinition[]

  /**
   * What this type can be asked to do to one of its objects, in the order the
   * buttons appear. See `ActionDefinition`.
   */
  readonly actions?: readonly ActionDefinition<TData>[]

  /**
   * Types this one can be PROMOTED to, in the order they are offered.
   *
   * The third registry addition Phase 3 needs: which types can convert into
   * which others. Declared by the source type, so the menu offering the
   * promotion names no type at all — and a new structured type becomes
   * reachable by adding itself to whatever should promote into it, rather than
   * by editing the menu.
   *
   * It says what is OFFERED, not what is legal. `ConvertObjects` enforces the
   * rules that must hold whatever the caller asks for — a locked object, a
   * container with children, a target with no place on the board — because a UI
   * affordance is a courtesy and the command layer is the rule.
   */
  readonly promotions?: readonly string[]

  /**
   * What can be DERIVED from this type, and what the new object's relation to
   * it means.
   *
   * The second registry addition Phase 3 named — relationship declarations, so
   * links can be validated and traversed. A derivation creates a new object and
   * a relation pointing from it BACK to the selection: an insight cites the
   * evidence it was drawn from, a hypothesis derives from that insight, an
   * experiment tests that hypothesis. Direction is always new → selected,
   * because the new object is the one making the claim.
   *
   * Distinct from `promotions`, which turns this object INTO another. A
   * promotion is "this was always evidence"; a derivation is "here is something
   * new that stands on it", and conflating them would mean the evidence
   * vanished at the moment it started being cited.
   *
   * This is also where the predicate vocabulary finally settles. ADR 0011
   * deferred it until the types existed and their real pairings were known;
   * these declarations ARE those pairings, in one place, rather than a free
   * string chosen at each call site.
   */
  readonly derivations?: readonly Derivation[]

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
  /** Erased form of the definition's own narrowing. */
  readonly stylePropsFor?: (object: AnyOpenFrameObject) => readonly StyleProp[]
  readonly validate: (data: unknown) => ValidationResult
  readonly migrate: (
    data: unknown,
    fromVersion: number,
    style?: Readonly<Record<string, unknown>>,
  ) => unknown
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
  readonly hitTest?: (
    object: AnyOpenFrameObject,
    doc: BoardDocument,
    point: Point,
    context: GeometryContext,
  ) => boolean
  readonly dependencies?: (object: AnyOpenFrameObject) => readonly ObjectId[]
  readonly relation?: (object: AnyOpenFrameObject) => RelationEdge | null
  readonly fields?: readonly FieldDefinition[]
  readonly promotions?: readonly string[]
  readonly derivations?: readonly Derivation[]
  readonly endpoints?: (
    object: AnyOpenFrameObject,
    doc: BoardDocument,
    context: GeometryContext,
  ) => readonly DraggableEndpoint[]
  readonly dividers?: (object: AnyOpenFrameObject) => readonly DraggableDivider[]
  readonly moveDivider?: (
    object: AnyOpenFrameObject,
    dividerId: string,
    to: number,
  ) => DividerMove<Record<string, unknown>> | null
  readonly retargetEndpoint?: (
    object: AnyOpenFrameObject,
    doc: BoardDocument,
    endpointId: string,
    target: EndpointTarget,
    context: GeometryContext,
  ) => Record<string, unknown>
  readonly cropWindow?: (object: AnyOpenFrameObject) => CropWindow
  readonly actions?: readonly ErasedAction[]
}

/** An action with its data type erased, as the registry stores it. */
interface ErasedAction {
  readonly id: string
  readonly label: string
  readonly applies?: (object: AnyOpenFrameObject) => boolean
  readonly apply: (object: AnyOpenFrameObject) => Record<string, unknown>
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
    /*
     * Carried through with the payload type erased. The cast is the same one
     * every other member here relies on: a definition is only ever handed
     * objects of its own type, because the registry looks it up BY that type.
     */
    ...(definition.stylePropsFor === undefined
      ? {}
      : {
          stylePropsFor: (object: AnyOpenFrameObject) =>
            (definition.stylePropsFor as (o: AnyOpenFrameObject) => readonly StyleProp[])(object),
        }),

    validate: (data) => {
      const result = definition.schema.safeParse(data)
      return result.success
        ? { ok: true, data: result.data }
        : { ok: false, issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }
    },

    migrate: (data, fromVersion, style = {}) => {
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
        current = migration(current, style)
      }
      return current
    },

    create: (init) => definition.create(init as Partial<TData> | undefined),

    describe: (object) => definition.describe(object as ObjectBase<TType, TData>),
  }

  const {
    getBounds,
    hitTest,
    dependencies,
    endpoints,
    retargetEndpoint,
    dividers,
    moveDivider,
    cropWindow,
    relation,
    fields,
    actions,
    promotions,
    derivations,
  } = definition
  return {
    ...erased,
    /*
     * Plain data, so it copies rather than being re-wrapped like the callbacks
     * below. It is listed here at all because EVERY optional member has to be:
     * both sides of this function declare them optional, so omitting one type
     * checks perfectly and erases the member to `undefined` at runtime. `fields`
     * was forgotten exactly once, and the two contract tests that existed to
     * police field declarations passed on the empty set instead of failing —
     * which is why `registry-contract.test.ts` now asserts a known type's
     * declarations survive the trip.
     */
    ...(fields === undefined ? {} : { fields }),
    ...(promotions === undefined ? {} : { promotions }),
    ...(derivations === undefined ? {} : { derivations }),
    ...(getBounds === undefined
      ? {}
      : {
          getBounds: (object, doc, context) =>
            getBounds(object as ObjectBase<TType, TData>, doc, context),
        }),
    ...(hitTest === undefined
      ? {}
      : {
          hitTest: (object, doc, point, context) =>
            hitTest(object as ObjectBase<TType, TData>, doc, point, context),
        }),
    ...(dependencies === undefined
      ? {}
      : { dependencies: (object) => dependencies(object as ObjectBase<TType, TData>) }),
    ...(relation === undefined
      ? {}
      : { relation: (object) => relation(object as ObjectBase<TType, TData>) }),
    ...(cropWindow === undefined
      ? {}
      : { cropWindow: (object) => cropWindow(object as ObjectBase<TType, TData>) }),
    ...(dividers === undefined
      ? {}
      : { dividers: (object) => dividers(object as ObjectBase<TType, TData>) }),
    ...(moveDivider === undefined
      ? {}
      : {
          moveDivider: (object, dividerId, to) =>
            moveDivider(object as ObjectBase<TType, TData>, dividerId, to),
        }),
    ...(endpoints === undefined
      ? {}
      : {
          endpoints: (object, doc, context) =>
            endpoints(object as ObjectBase<TType, TData>, doc, context),
        }),
    ...(retargetEndpoint === undefined
      ? {}
      : {
          retargetEndpoint: (object, doc, endpointId, target, context) =>
            retargetEndpoint(object as ObjectBase<TType, TData>, doc, endpointId, target, context),
        }),
    ...(actions === undefined
      ? {}
      : {
          actions: actions.map((action): ErasedAction => {
            const applies = action.applies
            return {
              id: action.id,
              label: action.label,
              ...(applies === undefined
                ? {}
                : { applies: (object) => applies(object as ObjectBase<string, TData>) }),
              apply: (object) => action.apply(object as ObjectBase<string, TData>),
            }
          }),
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
  /** Same pattern, same invalidation key, for the relation index. */
  #relationIndexDoc: BoardDocument | undefined
  #relationIndex: RelationIndex | undefined

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
  /**
   * A type's own account of an object: its search text, one-line summary and
   * named fields.
   *
   * The single seam board search, AI context, MCP and export all read from. It
   * lives here rather than at each call site so that the answer for a type this
   * build does not understand is given once — a board written by a newer build
   * still searches, and still lists, rather than throwing.
   */
  describeObject(object: AnyOpenFrameObject): ObjectDescription {
    return (
      this.#definitions.get(object.type)?.describe(object) ?? {
        searchText: '',
        // Its type is the only true thing available about an object whose
        // definition is missing.
        summary: object.type,
        fields: {},
      }
    )
  }

  hitTestObject(object: AnyOpenFrameObject, doc: BoardDocument, point: Point): boolean {
    const precise = this.#definitions.get(object.type)?.hitTest
    if (precise !== undefined) return precise(object, doc, point, this.#geometryContext(doc))
    const { x, y, width, height } = object.frame
    return containsRotatedPoint({ x, y, width, height }, object.frame.rotation, point)
  }

  /**
   * The draggable ends of an object, or none for types that have no such thing.
   * Empty for almost everything, which is what lets the overlay ask every
   * selected object without caring what it is.
   */
  endpointsOf(object: AnyOpenFrameObject, doc: BoardDocument): readonly DraggableEndpoint[] {
    return this.#definitions.get(object.type)?.endpoints?.(object, doc, this.#geometryContext(doc)) ?? []
  }

  /**
   * What a type is handed when it needs to know where ANOTHER object is.
   *
   * Only `boundsOf`, and only through the registry: a type that read
   * `other.frame` would be right about a note and wrong about a group, whose
   * frame is 0x0 and whose extent is its children's. That is rule 16 from the
   * other side — the object being asked about is the one with derived
   * geometry, rather than the one asking.
   */
  #geometryContext(doc: BoardDocument): GeometryContext {
    return { boundsOf: (other) => this.boundsOf(other, doc) }
  }

  /**
   * What this object can be asked to do RIGHT NOW — only the actions whose
   * type says they would change something. Empty for almost everything.
   */
  actionsOf(object: AnyOpenFrameObject): readonly OfferedAction[] {
    const actions = this.#definitions.get(object.type)?.actions ?? []
    return actions
      .filter((action) => action.applies?.(object) !== false)
      .map((action) => ({ id: action.id, label: action.label }))
  }

  /**
   * The data patch one of those actions produces, or `null` when the type does
   * not offer it. Null rather than an empty patch, so a caller can tell
   * "nothing to do" from "this type cannot".
   */
  applyAction(object: AnyOpenFrameObject, actionId: string): Record<string, unknown> | null {
    const action = this.#definitions.get(object.type)?.actions?.find((each) => each.id === actionId)
    if (action === undefined || action.applies?.(object) === false) return null
    return action.apply(object)
  }

  /**
   * The movable divisions inside an object. Empty for almost everything.
   */
  dividersOf(object: AnyOpenFrameObject): readonly DraggableDivider[] {
    return this.#definitions.get(object.type)?.dividers?.(object) ?? []
  }

  /**
   * What fraction of this object's content is on show, or `null` for a type
   * that shows all of whatever it holds.
   *
   * `null` rather than a full window, so a caller can tell "this type does not
   * crop" from "this one does and nothing is trimmed" — the first has no crop
   * handles, the second has handles that are simply all the way out.
   */
  cropWindowOf(object: AnyOpenFrameObject): CropWindow | null {
    return this.#definitions.get(object.type)?.cropWindow?.(object) ?? null
  }

  /**
   * The data patch that moves one divider, or `null` if the type does not have
   * any. Null rather than an empty patch, so a caller can tell "nothing to do"
   * from "this type cannot".
   */
  moveDivider(
    object: AnyOpenFrameObject,
    dividerId: string,
    to: number,
  ): DividerMove<Record<string, unknown>> | null {
    const move = this.#definitions.get(object.type)?.moveDivider
    return move === undefined ? null : move(object, dividerId, to)
  }

  /**
   * The data patch that moves one endpoint, or `null` if the type does not
   * support it. Null rather than an empty patch, so a caller can tell "nothing
   * to do" from "this type cannot".
   */
  retargetEndpoint(
    object: AnyOpenFrameObject,
    doc: BoardDocument,
    endpointId: string,
    target: EndpointTarget,
  ): Record<string, unknown> | null {
    const retarget = this.#definitions.get(object.type)?.retargetEndpoint
    return retarget === undefined
      ? null
      : retarget(object, doc, endpointId, target, this.#geometryContext(doc))
  }

  /**
   * Relations, indexed BOTH ways, built once per document.
   *
   * The reverse direction is the whole reason relations are objects: answering
   * "which insights cite this evidence?" by scanning every object's data would
   * be a full pass per query. One pass per document version, cached on document
   * identity — the same shape as `#childIndexFor`, and correct for the same
   * reason: the document is immutable and replaced wholesale on every change.
   */
  #relationIndexFor(doc: BoardDocument): RelationIndex {
    if (this.#relationIndexDoc === doc && this.#relationIndex !== undefined) {
      return this.#relationIndex
    }
    const outgoing = new Map<ObjectId, RelationLink[]>()
    const incoming = new Map<ObjectId, RelationLink[]>()
    const push = (
      index: Map<ObjectId, RelationLink[]>,
      key: ObjectId,
      link: RelationLink,
    ): void => {
      const existing = index.get(key)
      if (existing === undefined) index.set(key, [link])
      else existing.push(link)
    }

    for (const object of doc.objects.values()) {
      const edge = this.#definitions.get(object.type)?.relation?.(object)
      if (edge === undefined || edge === null) continue
      const link: RelationLink = { id: object.id, edge }
      push(outgoing, edge.from, link)
      push(incoming, edge.to, link)
    }

    this.#relationIndex = { outgoing, incoming }
    this.#relationIndexDoc = doc
    return this.#relationIndex
  }

  /** Relations pointing AWAY from `id` — what this object cites. */
  relationsFrom(doc: BoardDocument, id: ObjectId): readonly RelationLink[] {
    return this.#relationIndexFor(doc).outgoing.get(id) ?? []
  }

  /** Relations pointing AT `id` — what cites this object. The deferred question. */
  relationsTo(doc: BoardDocument, id: ObjectId): readonly RelationLink[] {
    return this.#relationIndexFor(doc).incoming.get(id) ?? []
  }

  /**
   * Every relation object that would be orphaned by deleting `ids`.
   *
   * A citation of nothing is not a citation, so a relation dies with either end
   * — unlike a connector, which converts an orphaned end to a free point.
   */
  relationsOrphanedBy(doc: BoardDocument, ids: readonly ObjectId[]): ObjectId[] {
    const index = this.#relationIndexFor(doc)
    const doomed = new Set<ObjectId>()
    for (const id of ids) {
      for (const link of index.outgoing.get(id) ?? []) doomed.add(link.id)
      for (const link of index.incoming.get(id) ?? []) doomed.add(link.id)
    }
    return [...doomed]
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
   * Which style controls THIS object offers.
   *
   * Asked of the registry rather than read off `capabilities.styleProps`
   * directly, so that a type whose properties vary by discriminant has one
   * place to say so — and so no panel can quietly disagree with it, which is
   * the whole of rule 21.
   *
   * An unknown type offers nothing, rather than everything: a quarantined
   * object is a payload this build could not interpret, and offering to
   * restyle it is offering to write into something we could not read.
   */
  stylePropsOf(object: AnyOpenFrameObject): readonly StyleProp[] {
    const definition = this.#definitions.get(object.type)
    if (definition === undefined) return []
    return definition.stylePropsFor?.(object) ?? definition.capabilities.styleProps
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
