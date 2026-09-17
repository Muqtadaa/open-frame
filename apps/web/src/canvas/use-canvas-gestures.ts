import {
  panViewport,
  rectFromPoints,
  screenToWorld,
  type AnyOpenFrameObject,
  type ObjectFrame,
  type ObjectId,
  type Point,
  type Rect,
  type Viewport,
} from '@openframe/core'
import {
  useCallback,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'

import { useOpenFrame } from '../app/runtime-context.js'
import { useCommands } from '../hooks/use-commands.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import {
  exceedsDragThreshold,
  onDoubleClick as decideDoubleClick,
  onPointerDown as decidePointerDown,
  type PointerIntent,
} from '../interaction/pointer-controller.js'
import { hitTest, objectsInMarquee } from './hit-testing.js'
import {
  CORNER_HANDLES,
  angleFrom,
  framesBounds,
  resizeBounds,
  scaleFrames,
  snapAngle,
  type HandleId,
} from './resize.js'

type GestureMode = 'pan' | 'translate' | 'marquee' | 'resize' | 'rotate' | 'none'

/** Pointer events originating in a text control belong to that control. */
function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

interface Gesture {
  readonly pointerId: number
  readonly mode: GestureMode
  readonly startWorld: Point
  readonly startClient: Point
  readonly startViewport: Viewport
  /** Snapshot of the objects being transformed, taken once at gesture start. */
  readonly subjects: readonly AnyOpenFrameObject[]
  readonly startBounds: Rect | null
  readonly handle: HandleId | null
  readonly startAngle: number
  moved: boolean
}

/** Reads the handle under the pointer, if the gesture began on one. */
function handleUnderPointer(target: EventTarget | null): string | null {
  if (!(target instanceof HTMLElement)) return null
  return target.closest<HTMLElement>('[data-handle]')?.dataset.handle ?? null
}

/**
 * Turns raw pointer input into store updates and commands.
 *
 * The decision of what a gesture MEANS lives in `pointer-controller.ts` as pure
 * functions; this hook only performs the effects. Keeping the two apart is what
 * lets interaction rules be tested without synthesising DOM events.
 *
 * Nothing here writes to the document except on pointer-up.
 */
export function useCanvasGestures(containerRef: RefObject<HTMLElement | null>) {
  const { runtime } = useOpenFrame()
  const commands = useCommands()
  const gesture = useRef<Gesture | null>(null)
  const spaceHeld = useRef(false)

  const toWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = containerRef.current?.getBoundingClientRect()
      const viewport = useInteractionStore.getState().viewport
      return screenToWorld(viewport, {
        x: clientX - (rect?.left ?? 0),
        y: clientY - (rect?.top ?? 0),
      })
    },
    [containerRef],
  )

  const applyIntent = useCallback(
    (intent: PointerIntent, worldPoint: Point): GestureMode | null => {
      const store = useInteractionStore.getState()
      switch (intent.kind) {
        case 'begin-pan':
          store.beginPan()
          return 'pan'
        case 'create': {
          const id = commands.createObject(intent.objectType, intent.at, intent.data)
          if (id !== null) {
            store.setSelection([id])
            store.setTool('select')
            // Drop straight into editing: the overwhelmingly common next action
            // after placing a note, a label or a shape is to type in it.
            store.setEditing(id)
          }
          return 'none'
        }
        case 'select':
          store.setSelection(intent.ids)
          return null
        case 'toggle-select':
          store.toggleSelection(intent.id)
          return 'none'
        case 'begin-translate':
          store.beginTranslate(intent.ids)
          return 'translate'
        case 'begin-marquee':
          store.beginMarquee(worldPoint)
          return 'marquee'
        case 'begin-edit':
          store.setEditing(intent.id)
          return 'none'
      }
    },
    [commands],
  )

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      /*
       * An inline editor lives INSIDE the canvas, so its pointer events bubble
       * up to here. Without this guard, clicking into a note to reposition the
       * caret would be read as a canvas gesture and close the editor.
       */
      if (isTextEntry(event.target)) return

      // Any press dismisses an open menu.
      useInteractionStore.getState().closeContextMenu()

      /*
       * Stop the browser moving focus to the canvas element. An editor opened
       * during this very gesture (creating a sticky note focuses it
       * immediately) would otherwise be blurred by the mouseup that follows —
       * committing and closing before a single character could be typed.
       */
      event.preventDefault()

      const store = useInteractionStore.getState()
      if (store.editingId !== null) {
        /*
         * Blur rather than clearing `editingId` outright: the editor commits on
         * blur, and unmounting it directly would silently discard whatever the
         * user had just typed. Clicking away from a note must save it.
         */
        const active = window.document.activeElement
        if (active instanceof HTMLElement) active.blur()
        else store.setEditing(null)
      }

      const grabbed = handleUnderPointer(event.target)
      if (grabbed !== null) {
        const document = runtime.store.getDocument()
        const subjects = [...store.selection]
          .map((id) => document.objects.get(id))
          .filter((object): object is AnyOpenFrameObject => object !== undefined)
        const startBounds = framesBounds(subjects)
        if (startBounds !== null) {
          const worldStart = toWorld(event.clientX, event.clientY)
          const centre = {
            x: startBounds.x + startBounds.width / 2,
            y: startBounds.y + startBounds.height / 2,
          }
          const rotating = grabbed === 'rotate'
          if (rotating) store.beginRotate()
          else store.beginResize(grabbed as HandleId)

          event.currentTarget.setPointerCapture(event.pointerId)
          gesture.current = {
            pointerId: event.pointerId,
            mode: rotating ? 'rotate' : 'resize',
            startWorld: worldStart,
            startClient: { x: event.clientX, y: event.clientY },
            startViewport: store.viewport,
            subjects,
            startBounds,
            handle: rotating ? null : (grabbed as HandleId),
            startAngle: angleFrom(centre, worldStart) - (subjects[0]?.frame.rotation ?? 0),
            moved: false,
          }
          return
        }
      }

      const worldPoint = toWorld(event.clientX, event.clientY)
      const intents = decidePointerDown({
        tool: store.tool,
        worldPoint,
        hitId: hitTest(runtime.store.getDocument(), runtime.registry, worldPoint),
        selection: store.selection,
        shiftKey: event.shiftKey,
        button: event.button,
        spaceHeld: spaceHeld.current,
        shapeKind: store.shapeKind,
      })

      let mode: GestureMode = 'none'
      for (const intent of intents) {
        const next = applyIntent(intent, worldPoint)
        if (next !== null) mode = next
      }

      if (mode !== 'none') {
        event.currentTarget.setPointerCapture(event.pointerId)
        gesture.current = {
          pointerId: event.pointerId,
          mode,
          startWorld: worldPoint,
          startClient: { x: event.clientX, y: event.clientY },
          // Re-read: `store` is a snapshot from BEFORE the intents ran, so its
          // selection and viewport are stale by this point.
          startViewport: useInteractionStore.getState().viewport,
          subjects: [],
          startBounds: null,
          handle: null,
          startAngle: 0,
          moved: false,
        }
      }
    },
    [applyIntent, runtime.registry, runtime.store, toWorld],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      const store = useInteractionStore.getState()
      const active = gesture.current

      if (active === null) {
        const worldPoint = toWorld(event.clientX, event.clientY)
        store.setHovered(hitTest(runtime.store.getDocument(), runtime.registry, worldPoint))
        return
      }

      const worldPoint = toWorld(event.clientX, event.clientY)

      if (active.mode === 'pan') {
        store.setViewport(
          panViewport(
            active.startViewport,
            event.clientX - active.startClient.x,
            event.clientY - active.startClient.y,
          ),
        )
        return
      }

      if (active.mode === 'translate') {
        // A press with a tremor must not become a move command that fills the
        // undo stack with actions the user never took.
        if (
          !active.moved &&
          !exceedsDragThreshold(active.startWorld, worldPoint, store.viewport.zoom)
        ) {
          return
        }
        active.moved = true
        store.updateTranslate(
          worldPoint.x - active.startWorld.x,
          worldPoint.y - active.startWorld.y,
        )
        return
      }

      if (active.mode === 'marquee') {
        active.moved = true
        store.updateMarquee(worldPoint)
        return
      }

      if (active.mode === 'resize' && active.startBounds !== null && active.handle !== null) {
        active.moved = true
        const delta = {
          x: worldPoint.x - active.startWorld.x,
          y: worldPoint.y - active.startWorld.y,
        }
        const next = resizeBounds(active.startBounds, active.handle, delta, {
          // Corners keep proportions by default; Shift releases that, matching
          // the convention in design tools.
          preserveAspect: CORNER_HANDLES.includes(active.handle) ? !event.shiftKey : event.shiftKey,
          fromCentre: event.altKey,
        })
        store.previewFrames(toFrameMap(scaleFrames(active.subjects, active.startBounds, next)))
        return
      }

      if (active.mode === 'rotate' && active.startBounds !== null) {
        active.moved = true
        const centre = {
          x: active.startBounds.x + active.startBounds.width / 2,
          y: active.startBounds.y + active.startBounds.height / 2,
        }
        const rotation = snapAngle(
          angleFrom(centre, worldPoint) - active.startAngle,
          event.shiftKey,
        )
        store.previewFrames(
          new Map(active.subjects.map((object) => [object.id, { ...object.frame, rotation }])),
        )
      }
    },
    [runtime.registry, runtime.store, toWorld],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      const active = gesture.current
      gesture.current = null
      if (active === null) return
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }

      const store = useInteractionStore.getState()

      // THE COMMIT. One command for the whole gesture, whatever its length.
      //
      // The ids come from the live drag state rather than a copy taken at
      // pointer-down: caching them invites exactly the staleness bug where a
      // click that both selects and starts a drag commits an empty move.
      if (active.mode === 'translate' && active.moved && store.drag.kind === 'translate') {
        const { dx, dy, ids } = store.drag
        commands.moveObjects([...ids].map((id) => ({ id, dx, dy })))
      }

      if (active.mode === 'resize' && active.moved && store.drag.kind === 'resize') {
        commands.resizeObjects([...store.drag.frames].map(([id, frame]) => ({ id, frame })))
      }

      if (active.mode === 'rotate' && active.moved && store.drag.kind === 'rotate') {
        commands.rotateObjects(
          [...store.drag.frames].map(([id, frame]) => ({ id, rotation: frame.rotation })),
        )
      }

      if (active.mode === 'marquee' && store.drag.kind === 'marquee') {
        const region = rectFromPoints(store.drag.origin, store.drag.current)
        const ids = objectsInMarquee(runtime.store.getDocument(), runtime.registry, region)
        if (event.shiftKey) {
          store.setSelection([...new Set([...store.selection, ...ids])])
        } else {
          store.setSelection(ids)
        }
      }

      store.endDrag()
    },
    [commands, runtime.registry, runtime.store],
  )

  const onDoubleClick = useCallback(
    // Double-click arrives as a MouseEvent in React, not a PointerEvent.
    (event: ReactMouseEvent<HTMLElement>): void => {
      const worldPoint = toWorld(event.clientX, event.clientY)
      const hitId = hitTest(runtime.store.getDocument(), runtime.registry, worldPoint)
      for (const intent of decideDoubleClick(hitId)) applyIntent(intent, worldPoint)
    },
    [applyIntent, runtime.registry, runtime.store, toWorld],
  )

  const onContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>): void => {
      event.preventDefault()
      const store = useInteractionStore.getState()
      const worldPoint = toWorld(event.clientX, event.clientY)
      const hit = hitTest(runtime.store.getDocument(), runtime.registry, worldPoint)

      // Right-clicking an unselected object selects it first, so the menu always
      // acts on what the user pointed at.
      if (hit !== null && !store.selection.has(hit)) store.setSelection([hit])
      if (hit === null) store.clearSelection()

      store.openContextMenu({ x: event.clientX, y: event.clientY })
    },
    [runtime.registry, runtime.store, toWorld],
  )

  const setSpaceHeld = useCallback((held: boolean): void => {
    spaceHeld.current = held
  }, [])

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
    onContextMenu,
    setSpaceHeld,
  }
}

function toFrameMap(
  entries: readonly { readonly id: ObjectId; readonly frame: ObjectFrame }[],
): ReadonlyMap<ObjectId, ObjectFrame> {
  return new Map(entries.map((entry) => [entry.id, entry.frame]))
}
