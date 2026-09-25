import type { ComponentType, ReactNode } from 'react'

import type {
  AnyOpenFrameObject,
  AssetRef,
  BoardDocument,
  ColorToken,
  ObjectBase,
  Point,
  Rect,
} from '@openframe/core'

/**
 * The REACT half of the object type system.
 *
 * `@openframe/core` holds the pure half — schema, migrations, capabilities,
 * `describe()`. This holds the part that cannot live there without dragging
 * React into the domain and breaking the renderer-replaceability guarantee.
 * The two are joined by the type string, and each can be missing without the
 * other breaking:
 *
 *   definition, no view  -> renders as a labelled placeholder (see FallbackView)
 *   view, no definition  -> never instantiated; the command layer rejects it
 *
 * The first case is what lets a board containing a future `evidence` object
 * open in today's build rather than crashing.
 */

/**
 * Where an asset's bytes have got to.
 *
 * Three states rather than `string | undefined`, because "still loading" and
 * "will never arrive" must look different to the user: a spinner that never
 * resolves is worse than an honest broken-image placeholder.
 */
export type AssetUrlState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly url: string }
  | { readonly status: 'missing' }

/** Looks up an asset URL synchronously. Views cannot await. */
export type AssetUrlLookup = (ref: AssetRef) => AssetUrlState

export interface ObjectViewProps<TData = unknown> {
  readonly object: ObjectBase<string, TData>
  readonly selected: boolean
  /**
   * Current board zoom. Supplied so a view can counter-scale chrome that should
   * stay a constant size on screen — a frame's title, for instance. Views are a
   * leaf module and cannot read the interaction store themselves.
   */
  readonly zoom: number
  /**
   * The board, for types whose rendering depends on OTHER objects — a connector
   * resolves its endpoints through this. Read at render time rather than
   * subscribed to; the registry's `dependencies` is what makes it reactive.
   */
  readonly document: BoardDocument
  /**
   * Resolves an asset to something paintable. Synchronous by necessity — a
   * render cannot await — so it reports `loading` on a miss and the view
   * re-renders when the bytes arrive.
   */
  readonly assetUrl: AssetUrlLookup
  /**
   * Where ANOTHER object's edges are, for a type that draws against one.
   *
   * Handed in rather than reached for: a view is a leaf and has no registry,
   * and `other.frame` is the wrong answer for anything whose extent is derived
   * — a group's frame is 0x0 and its children are the truth. A connector
   * joined to a group ran to the group's origin until this existed (rule 16).
   */
  readonly boundsOf: BoundsLookup
}

/** The real extent of an object, as the registry computes it. */
export type BoundsLookup = (object: AnyOpenFrameObject) => Rect

export interface ObjectEditorProps<TData = unknown> {
  readonly object: ObjectBase<string, TData>
  readonly zoom: number
  readonly document: BoardDocument
  /** The same lookup the renderer gets, for an editor that draws geometry. */
  readonly boundsOf: BoundsLookup
  /**
   * Where the pointer was when editing began, in WORLD units, or `null` when
   * it began some other way — a keypress, or a command.
   *
   * Optional information rather than a capability: a type that has one place
   * to put a caret ignores it, and almost all of them do. A table has as many
   * places as it has cells, and without this the caret lands in the first one
   * however carefully you aimed.
   */
  readonly at: Point | null
  /**
   * Apparatus placed beside the object rather than drawn inside it.
   *
   * A table's colour bar and its row and column controls were rendered inside
   * this editor, which is inside the world transform — so they multiplied by
   * the zoom and were pinned to an edge that leaves the window as soon as you
   * zoom in. Anything rendered into this lands in a SCREEN-space layer that
   * places and clamps it with the same code the record panel uses.
   *
   * It arrives as a PROP rather than being imported, and that is the whole
   * design: `views/` is a leaf and may not reach the canvas, the runtime or
   * the interaction store. The canvas hands down a component already bound to
   * its layer, so a view can place apparatus perfectly without knowing that a
   * viewport exists.
   *
   * `anchor` is what the apparatus belongs beside, as a fraction of the
   * object's own extent — the unit a divider's position and a comment pin
   * already use. `null` means the whole object.
   */
  readonly Chrome: ComponentType<{
    readonly anchor?: Rect | null | undefined
    /** Sides to try, in order. Two pieces of apparatus on one object that both
     * take the default land on top of each other. */
    readonly prefer?: readonly ('right' | 'left' | 'below' | 'above' | 'over')[] | undefined
    readonly children: ReactNode
  }>
  /**
   * Apparatus drawn exactly ON the object, in screen space: `place` turns a
   * fraction of the object's extent into a screen rectangle in the chrome
   * layer. For what must line up with the object's own geometry — a table's
   * column letters, a selection ring round some of its cells — where `Chrome`
   * would float a surface beside it instead.
   */
  readonly Overlay: ComponentType<{
    readonly children: (place: (fraction: Rect) => Rect) => ReactNode
  }>
  readonly onCommit: (patch: Partial<TData>) => void
  readonly onCancel: () => void
}

export interface ObjectViewDefinition {
  readonly type: string
  readonly Renderer: ComponentType<ObjectViewProps>
  readonly InlineEditor?: ComponentType<ObjectEditorProps>
  /**
   * Declares that this view reads `assetUrl`, so its objects subscribe to asset
   * loads and redraw when bytes arrive.
   *
   * It is a flag on the definition rather than a check for `type === 'image'`
   * at the call site, for the usual reason: behaviour that varies by type
   * belongs to the type. Without it every object on the board would subscribe
   * to every asset load — ten thousand listeners woken by one image.
   */
  readonly usesAssets?: boolean
  /**
   * The colour a fresh object of this type shows before anybody chooses one.
   *
   * Declared, because the record panel has to MARK it: a new sticky was
   * visibly yellow while no swatch said so, and the custom picker opened on
   * grey. The renderer still draws its own fallback — as a surface for a note,
   * as ink for a line — and `default-colour-coverage.test` renders every type
   * that takes a colour with none set and holds the two to the same answer.
   */
  readonly defaultColor?: ColorToken
}

/**
 * Erases a typed view for storage. Mirrors `defineObjectType` in core, and
 * contains the only casts on this side, for the same reason: authors keep full
 * type safety, consumers get a uniform interface.
 */
export function defineObjectView<TData>(definition: {
  type: string
  Renderer: ComponentType<ObjectViewProps<TData>>
  InlineEditor?: ComponentType<ObjectEditorProps<TData>>
  usesAssets?: boolean
  defaultColor?: ColorToken
}): ObjectViewDefinition {
  /*
   * Spread one optional at a time. Every member has to be listed or it is
   * silently dropped — the same trap `defineObjectType` warns about in core,
   * and the reason a capability added to one of these and forgotten here
   * simply never arrives.
   */
  return {
    type: definition.type,
    Renderer: definition.Renderer as ComponentType<ObjectViewProps>,
    ...(definition.usesAssets === true ? { usesAssets: true } : {}),
    ...(definition.defaultColor === undefined ? {} : { defaultColor: definition.defaultColor }),
    ...(definition.InlineEditor === undefined
      ? {}
      : { InlineEditor: definition.InlineEditor as ComponentType<ObjectEditorProps> }),
  }
}

export class ObjectViewRegistry {
  readonly #views = new Map<string, ObjectViewDefinition>()

  constructor(views: readonly ObjectViewDefinition[] = []) {
    for (const view of views) this.#views.set(view.type, view)
  }

  get(type: string): ObjectViewDefinition | undefined {
    return this.#views.get(type)
  }

  has(type: string): boolean {
    return this.#views.has(type)
  }

  list(): ObjectViewDefinition[] {
    return [...this.#views.values()]
  }
}

export type { AnyOpenFrameObject }
