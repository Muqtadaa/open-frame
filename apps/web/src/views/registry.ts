import type { ComponentType } from 'react'

import type { AnyOpenFrameObject, AssetRef, BoardDocument, ObjectBase } from '@openframe/core'

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
}

export interface ObjectEditorProps<TData = unknown> {
  readonly object: ObjectBase<string, TData>
  readonly zoom: number
  readonly document: BoardDocument
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
}): ObjectViewDefinition {
  const base = {
    type: definition.type,
    Renderer: definition.Renderer as ComponentType<ObjectViewProps>,
    ...(definition.usesAssets === true ? { usesAssets: true } : {}),
  }
  return definition.InlineEditor === undefined
    ? base
    : { ...base, InlineEditor: definition.InlineEditor as ComponentType<ObjectEditorProps> }
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
