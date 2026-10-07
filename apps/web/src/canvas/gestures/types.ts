import type {
  AnyOpenFrameObject,
  MarkAuthor,
  ObjectId,
  Point,
  Rect,
  Viewport,
} from '@openframe/core'
import type { PointerEvent as ReactPointerEvent } from 'react'

import type { BoardCommands } from '../../hooks/use-commands.js'
import type { useInteractionStore } from '../../interaction/interaction-store.js'
import type { OpenFrameRuntime } from '../../runtime/context.js'
import type { HandleId } from '../../scene/resize.js'

/**
 * Every mode a pointer gesture on the board can be in, as a list so a test can
 * hold `HANDLERS` to having one for each.
 */
export const GESTURE_MODES = [
  'pan',
  'translate',
  'marquee',
  /** Sweeping out a NEW object's size, before anything exists. */
  'draw',
  'resize',
  'rotate',
  'connect',
  /** Dragging one END of an already-existing object, rather than drawing a new one. */
  'endpoint',
  /** Dragging a division INSIDE one — a table's column or row boundary. */
  'divider',
  'crop',
  /** A dot pressed onto an object, cast on release unless the press moved. */
  'vote',
] as const

export type ActiveMode = (typeof GESTURE_MODES)[number]
export type GestureMode = ActiveMode | 'none'

export interface Gesture {
  readonly pointerId: number
  readonly mode: ActiveMode
  /** Which internal division is being dragged, for a `divider` gesture. */
  readonly dividerId?: string
  readonly startWorld: Point
  readonly startClient: Point
  readonly startViewport: Viewport
  /** Snapshot of the objects being transformed, taken once at gesture start. */
  readonly subjects: readonly AnyOpenFrameObject[]
  readonly startBounds: Rect | null
  /** Snapshot too: static objects do not move during a drag (see alignment.ts). */
  readonly alignTargets: readonly Rect[]
  readonly handle: HandleId | null
  /**
   * Which end is being dragged, in the owning type's own naming.
   *
   * Not readonly, because a handle can hand the drag over: one that creates
   * something names its successor (`becomes`) and the rest of the drag belongs
   * to that. See `reshapeOf`.
   */
  endpointId: string | null
  readonly startAngle: number
  moved: boolean
  /** What a `vote` gesture casts on release, and as whom. */
  readonly vote?: {
    readonly on: ObjectId
    readonly remove: boolean
    readonly by: MarkAuthor
  }
}

export type InteractionSnapshot = ReturnType<typeof useInteractionStore.getState>

/** What every mode is handed: the wired app, and a way from the screen to the board. */
export interface GestureContext {
  readonly runtime: OpenFrameRuntime
  readonly commands: BoardCommands
  readonly toWorld: (clientX: number, clientY: number) => Point
}

/**
 * One mode of pointer gesture, from the first move to the release.
 *
 * Where each STARTS is not here: most begin from a pointer intent, some from a
 * handle, and the press decides which before any mode exists. What a mode
 * does once it is running is all its own, which is what was spread through
 * four handlers of one 1,600-line hook.
 */
export interface GestureHandler {
  /**
   * What the mode needs snapshotted at the press when it began from an intent
   * (rule 17: anything a gesture compares against is taken at its START).
   */
  readonly prepare?: (
    ctx: GestureContext,
    settled: InteractionSnapshot,
  ) => {
    readonly subjects: readonly AnyOpenFrameObject[]
    readonly alignTargets: readonly Rect[]
  }
  /** A preview frame. Writes interaction state only — never the document (rule 4). */
  readonly move: (
    ctx: GestureContext,
    active: Gesture,
    event: ReactPointerEvent<HTMLElement>,
    worldPoint: Point,
    store: InteractionSnapshot,
  ) => void
  /**
   * The release: at most ONE command for the whole gesture. The drag state is
   * ended after it by the caller, whatever the mode.
   */
  readonly commit: (
    ctx: GestureContext,
    active: Gesture,
    event: ReactPointerEvent<HTMLElement>,
    store: InteractionSnapshot,
  ) => void
}

/** Snapshot fields for a gesture that was not begun from an intent. */
export function gestureAt(
  event: ReactPointerEvent<HTMLElement>,
  mode: ActiveMode,
  startWorld: Point,
  startViewport: Viewport,
  rest: Partial<
    Omit<Gesture, 'pointerId' | 'mode' | 'startWorld' | 'startClient' | 'startViewport'>
  > = {},
): Gesture {
  return {
    pointerId: event.pointerId,
    mode,
    startWorld,
    startClient: { x: event.clientX, y: event.clientY },
    startViewport,
    subjects: [],
    startBounds: null,
    alignTargets: [],
    handle: null,
    endpointId: null,
    startAngle: 0,
    moved: false,
    ...rest,
  }
}
