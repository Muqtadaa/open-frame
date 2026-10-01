import {
  asObjectId,
  type BoardDocument,
  type ObjectId,
  type ObjectStyle,
  type Point,
} from '@openframe/core'
import { createTestHarness, type TestHarness } from '@openframe/core/testing'
import type { PointerEvent as ReactPointerEvent } from 'react'

import type { BoardCommands } from '../../hooks/use-commands.js'
import { useInteractionStore } from '../../interaction/interaction-store.js'
import type { OpenFrameRuntime } from '../../runtime/context.js'
import type { Gesture, GestureContext, GestureHandler, InteractionSnapshot } from './types.js'

/**
 * A gesture mode run without a canvas, a hook or a DOM, for its tests.
 *
 * Every mode was reachable only through an end-to-end drag, so what each one
 * decides — a tremor is not a move, Cmd/Ctrl suspends the grid, a release
 * dispatches ONE command — was proved only in a browser and broke three
 * engines at a time. Here the document is core's own test harness, the screen
 * IS the board (zoom 1, no pan), and the commands are a recorder: a test can
 * say exactly which command a release made, and how many.
 */

export interface Recorded {
  readonly name: string
  readonly args: readonly unknown[]
}

/** The id a recorded `create*` answers with, so a mode's follow-up can be checked. */
export const MADE = asObjectId('obj_made')

export interface Modifiers {
  readonly shiftKey?: boolean
  readonly altKey?: boolean
  readonly metaKey?: boolean
  readonly ctrlKey?: boolean
  readonly target?: EventTarget | null
}

export interface GestureBench {
  readonly harness: TestHarness
  readonly ctx: GestureContext
  /** Every command a mode called, in order. */
  readonly calls: Recorded[]
  /** A live snapshot of the interaction store, as the hook hands each call one. */
  readonly store: () => InteractionSnapshot
  readonly make: (
    type: string,
    frame: { x: number; y: number; width: number; height: number },
    extra?: { data?: Record<string, unknown>; style?: ObjectStyle; parentId?: ObjectId },
  ) => ObjectId
  readonly pointer: (at: Point, mods?: Modifiers) => ReactPointerEvent<HTMLElement>
  /**
   * Moves through `points`, then releases at the last of them. Returns the
   * documents seen after each move, so a test can hold rule 4 to the letter:
   * nothing is written while the pointer is down.
   */
  readonly drag: (
    handler: GestureHandler,
    active: Gesture,
    points: readonly Point[],
    mods?: Modifiers,
  ) => { readonly during: readonly BoardDocument[] }
}

export function gestureBench(): GestureBench {
  const harness = createTestHarness()
  useInteractionStore.setState({
    selection: new Set(),
    drag: { kind: 'idle' },
    viewport: { x: 0, y: 0, zoom: 1 },
    canvasSize: { width: 1280, height: 720 },
    snapToGrid: true,
    tool: 'select',
    editingId: null,
    croppingId: null,
  })

  const calls: Recorded[] = []
  const commands = new Proxy(
    {},
    {
      get:
        (_target, name) =>
        (...args: unknown[]) => {
          calls.push({ name: String(name), args })
          return String(name).startsWith('create') ? MADE : undefined
        },
    },
  ) as BoardCommands

  const ctx: GestureContext = {
    // A mode reads the document and the registry and nothing else of the
    // runtime; a whole runtime here would be a composition root in a test.
    runtime: { store: harness.store, registry: harness.registry } as unknown as OpenFrameRuntime,
    commands,
    toWorld: (x, y) => ({ x, y }),
  }

  const pointer: GestureBench['pointer'] = (at, mods = {}) =>
    ({
      pointerId: 1,
      clientX: at.x,
      clientY: at.y,
      shiftKey: mods.shiftKey ?? false,
      altKey: mods.altKey ?? false,
      metaKey: mods.metaKey ?? false,
      ctrlKey: mods.ctrlKey ?? false,
      target: mods.target ?? null,
    }) as unknown as ReactPointerEvent<HTMLElement>

  const store = (): InteractionSnapshot => useInteractionStore.getState()

  return {
    harness,
    ctx,
    calls,
    store,
    pointer,
    make: (type, frame, extra = {}) => {
      const id = asObjectId(`obj_${type}_${String(harness.store.getDocument().objects.size)}`)
      const result = harness.dispatcher.dispatch({
        kind: 'CreateObjects',
        objects: [
          {
            id,
            type,
            ...frame,
            ...(extra.data === undefined ? {} : { data: extra.data }),
            ...(extra.style === undefined ? {} : { style: extra.style }),
            ...(extra.parentId === undefined ? {} : { parentId: extra.parentId }),
          },
        ],
      })
      if (!result.ok) throw result.error
      return id
    },
    drag: (handler, active, points, mods = {}) => {
      const during: BoardDocument[] = []
      for (const at of points) {
        handler.move(ctx, active, pointer(at, mods), at, store())
        during.push(harness.store.getDocument())
      }
      const last = points.at(-1) ?? active.startWorld
      handler.commit(ctx, active, pointer(last, mods), store())
      return { during }
    },
  }
}
