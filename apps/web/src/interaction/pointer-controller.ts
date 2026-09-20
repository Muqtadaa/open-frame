import type { ObjectId, Point, ShapeKind } from '@openframe/core'

import type { Tool } from './interaction-store.js'

/**
 * What a pointer gesture MEANS, decided without touching React, the DOM or the
 * document.
 *
 * Keeping the decision separate from the effect is what makes interaction
 * behaviour testable: the tests below drive these functions with plain objects
 * and assert intents, with no synthetic events and no rendered component. The
 * React layer's only job is to turn an intent into a store update or a command.
 */

export type PointerIntent =
  | { readonly kind: 'begin-pan' }
  | {
      readonly kind: 'create'
      readonly objectType: string
      readonly at: Point
      readonly data?: Readonly<Record<string, unknown>>
    }
  | { readonly kind: 'select'; readonly ids: readonly ObjectId[] }
  | { readonly kind: 'toggle-select'; readonly id: ObjectId }
  | { readonly kind: 'begin-translate'; readonly ids: readonly ObjectId[] }
  | {
      readonly kind: 'drop-comment'
      readonly at: Point
      readonly on: ObjectId | null
    }
  | { readonly kind: 'begin-marquee'; readonly at: Point }
  /**
   * Starts drawing a new object to size.
   *
   * Distinct from `create`, which places one immediately. Which tools draw and
   * which place is a property of the OBJECT — a sticky has a size that means
   * something and a shape does not — so the two intents stay separate rather
   * than one gaining a flag.
   */
  | {
      readonly kind: 'begin-draw'
      readonly objectType: string
      readonly at: Point
      readonly data?: Readonly<Record<string, unknown>>
    }
  | { readonly kind: 'begin-edit'; readonly id: ObjectId }
  /** Starts drawing a connector from whatever is under the pointer. */
  | { readonly kind: 'begin-connect'; readonly from: ObjectId | null; readonly at: Point }

export interface PointerDownContext {
  readonly tool: Tool
  readonly worldPoint: Point
  /** Topmost object under the pointer, or null for empty canvas. */
  readonly hitId: ObjectId | null
  readonly selection: ReadonlySet<ObjectId>
  readonly shiftKey: boolean
  /** 0 = primary, 1 = middle. */
  readonly button: number
  readonly spaceHeld: boolean
  /** Which variant the shape tool is currently set to. */
  readonly shapeKind: ShapeKind
}

const MIDDLE_BUTTON = 1

export function onPointerDown(ctx: PointerDownContext): readonly PointerIntent[] {
  // Space-drag and middle-drag pan regardless of the active tool — a universal
  // convention in canvas tools, and cheap to honour.
  if (ctx.button === MIDDLE_BUTTON || ctx.spaceHeld || ctx.tool === 'pan') {
    return [{ kind: 'begin-pan' }]
  }

  /*
   * Creation tools are data-driven rather than a branch per tool, so adding an
   * object type does not add a case here. The registry already knows how to
   * build any registered type; this only has to name it.
   */
  if (ctx.tool === 'sticky') return [{ kind: 'create', objectType: 'sticky', at: ctx.worldPoint }]
  if (ctx.tool === 'text') return [{ kind: 'create', objectType: 'text', at: ctx.worldPoint }]
  if (ctx.tool === 'table') return [{ kind: 'create', objectType: 'table', at: ctx.worldPoint }]
  if (ctx.tool === 'code') return [{ kind: 'create', objectType: 'code', at: ctx.worldPoint }]
  if (ctx.tool === 'connector') {
    return [{ kind: 'begin-connect', from: ctx.hitId, at: ctx.worldPoint }]
  }
  /*
   * A comment is dropped where you click, and carries WHAT you clicked on if
   * anything was there. The point is what pins it; the object is an
   * association, so deleting that object later leaves the comment exactly
   * where it was put rather than taking the discussion with it.
   */
  if (ctx.tool === 'comment') {
    return [{ kind: 'drop-comment', at: ctx.worldPoint, on: ctx.hitId }]
  }
  /*
   * Frames and shapes are DRAWN, the way they are in every graphics tool: press,
   * drag out the size, release. A click that does not travel still places one at
   * the type's default size, so nothing is taken away.
   *
   * Stickies and text are not drawn. A sticky's size is a property of the type —
   * they are all the same size on purpose, because a wall of notes at different
   * sizes stops reading as a wall of notes — and a text object sizes itself to
   * what is typed into it.
   */
  if (ctx.tool === 'frame') return [{ kind: 'begin-draw', objectType: 'frame', at: ctx.worldPoint }]
  if (ctx.tool === 'shape') {
    return [
      { kind: 'begin-draw', objectType: 'shape', at: ctx.worldPoint, data: { shape: ctx.shapeKind } },
    ]
  }

  if (ctx.hitId === null) {
    return ctx.shiftKey
      ? [{ kind: 'begin-marquee', at: ctx.worldPoint }]
      : [
          { kind: 'select', ids: [] },
          { kind: 'begin-marquee', at: ctx.worldPoint },
        ]
  }

  if (ctx.shiftKey) {
    return [{ kind: 'toggle-select', id: ctx.hitId }]
  }

  // Clicking an already-selected object drags the WHOLE selection; clicking an
  // unselected one selects it first. Anything else makes multi-object drag
  // impossible without a modifier.
  const ids = ctx.selection.has(ctx.hitId) ? [...ctx.selection] : [ctx.hitId]
  return ctx.selection.has(ctx.hitId)
    ? [{ kind: 'begin-translate', ids }]
    : [
        { kind: 'select', ids },
        { kind: 'begin-translate', ids },
      ]
}

export function onDoubleClick(hitId: ObjectId | null): readonly PointerIntent[] {
  return hitId === null ? [] : [{ kind: 'begin-edit', id: hitId }]
}

/**
 * The distance a pointer must travel before a press becomes a drag.
 * Without it, a click with a one-pixel tremor dispatches a move command and
 * fills the undo stack with actions the user never took.
 */
export const DRAG_THRESHOLD_PX = 3

export function exceedsDragThreshold(from: Point, to: Point, zoom: number): boolean {
  const dx = (to.x - from.x) * zoom
  const dy = (to.y - from.y) * zoom
  return Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX
}
