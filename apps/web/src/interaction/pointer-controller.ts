import type { ObjectId, Point } from '@openframe/core'

import type { Placement, Tool } from '../scene/tools.js'

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
   * A dot on what was pressed, or one taken back off it — cast on RELEASE, so
   * a press that becomes a drag or the first finger of a pinch casts nothing.
   */
  | { readonly kind: 'begin-vote'; readonly on: ObjectId; readonly remove: boolean }
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
  | {
      readonly kind: 'begin-connect'
      /** What the finished line is: the armed tool's type, and its data. */
      readonly objectType: string
      readonly data?: Readonly<Record<string, unknown>>
      readonly from: ObjectId | null
      readonly at: Point
    }

export interface PointerDownContext {
  readonly tool: Tool
  readonly worldPoint: Point
  /** Topmost object under the pointer, or null for empty canvas. */
  readonly hitId: ObjectId | null
  readonly selection: ReadonlySet<ObjectId>
  readonly shiftKey: boolean
  /** Takes a vote back rather than casting one. */
  readonly altKey?: boolean
  /** 0 = primary, 1 = middle, 2 = secondary. */
  readonly button: number
  /**
   * A press the platform reads as a right-click — Ctrl-click on a Mac. It
   * opens the context menu, and must not also do what a click would.
   */
  readonly contextClick?: boolean
  readonly spaceHeld: boolean
  /**
   * What the armed tool makes, when it makes something: the type, how a press
   * places it, and the data its options give it. Resolved by the caller from
   * the type's declared tool, so this stays a pure function of what it is
   * handed and names no type.
   */
  readonly make: {
    readonly type: string
    readonly place: Placement
    readonly data?: Readonly<Record<string, unknown>>
  } | null
  /**
   * Which objects are locked, so a press on one does not become a drag.
   *
   * Decided HERE rather than left to the command to refuse. The command does
   * refuse it — `requireUnlocked` has always been there — but by then the
   * gesture has run: the object follows the pointer across the board and snaps
   * back on release, which reads as the app dropping the change rather than as
   * the object being held in place. A lock should feel like a lock.
   */
  readonly locked: ReadonlySet<ObjectId>
}

const MIDDLE_BUTTON = 1

export function onPointerDown(ctx: PointerDownContext): readonly PointerIntent[] {
  // Space-drag and middle-drag pan regardless of the active tool — a universal
  // convention in canvas tools, and cheap to honour.
  if (ctx.button === MIDDLE_BUTTON || ctx.spaceHeld || ctx.tool === 'pan') {
    return [{ kind: 'begin-pan' }]
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
   * A dot goes on whatever was pressed, and Alt takes one back. Pressing
   * empty board does nothing: there is nothing to vote for there, and
   * clearing the selection would only lose what somebody was looking at.
   * Whether the object can carry a vote is the command's to say.
   */
  if (ctx.tool === 'dot') {
    // Only a primary click votes: a right-click is for the menu, which is
    // where somebody goes to take a vote BACK (Codex-free finding, 10-07).
    if (ctx.hitId === null || ctx.button !== 0 || ctx.contextClick === true) return []
    return [{ kind: 'begin-vote', on: ctx.hitId, remove: ctx.altKey === true }]
  }

  /*
   * Creation is data-driven, not a branch per tool: the type declares how a
   * press places one, and the registry already knows how to build it. This
   * used to read "data-driven" over an `if` for every tool, so a new type with
   * a tool had to be added here as well.
   */
  const { make } = ctx
  if (make !== null) {
    const data = make.data === undefined ? {} : { data: make.data }
    switch (make.place) {
      case 'click':
        return [{ kind: 'create', objectType: make.type, at: ctx.worldPoint, ...data }]
      case 'draw':
        return [{ kind: 'begin-draw', objectType: make.type, at: ctx.worldPoint, ...data }]
      case 'connect':
        return [
          {
            kind: 'begin-connect',
            objectType: make.type,
            ...data,
            from: ctx.hitId,
            at: ctx.worldPoint,
          },
        ]
    }
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
  /*
   * A locked object still SELECTS — you have to be able to reach one to
   * unlock it — it just never starts a drag. With a mixed selection the
   * unlocked members move and the locked ones stay, which is the only
   * behaviour that can be described in one sentence.
   */
  const movable = ids.filter((id) => !ctx.locked.has(id))
  const selectFirst = !ctx.selection.has(ctx.hitId)

  if (movable.length === 0) {
    return selectFirst ? [{ kind: 'select', ids }] : []
  }

  return selectFirst
    ? [
        { kind: 'select', ids },
        { kind: 'begin-translate', ids: movable },
      ]
    : [{ kind: 'begin-translate', ids: movable }]
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
