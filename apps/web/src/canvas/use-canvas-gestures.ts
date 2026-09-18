import {
  panViewport,
  rectFromPoints,
  screenToWorld,
  visibleWorldRect,
  type AnyOpenFrameObject,
  type BoardDocument,
  type ConnectorEndpoint,
  type ObjectTypeRegistry,
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

import { useOpenFrame } from '../runtime/context.js'
import { useCommands } from '../hooks/use-commands.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import {
  exceedsDragThreshold,
  onDoubleClick as decideDoubleClick,
  onPointerDown as decidePointerDown,
  type PointerIntent,
} from '../interaction/pointer-controller.js'
import { containerAt, hitTest, hitTestRaw, objectsInMarquee } from '../scene/hit-testing.js'
import { alignToNeighbours, alignmentTargets, type AlignmentGuide } from '../scene/alignment.js'
import { cullToViewport } from '../scene/culling.js'
import { snapDelta, snapRect } from '../scene/snapping.js'
import {
  CORNER_HANDLES,
  angleFrom,
  framesBounds,
  resizeBounds,
  scaleFrames,
  snapAngle,
  type HandleId,
} from '../scene/resize.js'

type GestureMode =
  | 'pan'
  | 'translate'
  | 'marquee'
  | 'resize'
  | 'rotate'
  | 'connect'
  /** Dragging one END of an already-existing object, rather than drawing a new one. */
  | 'endpoint'
  | 'none'

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
  /** Snapshot too: static objects do not move during a drag (see alignment.ts). */
  readonly alignTargets: readonly Rect[]
  readonly handle: HandleId | null
  /** Which end is being dragged, in the owning type's own naming. */
  readonly endpointId: string | null
  readonly startAngle: number
  moved: boolean
}

/**
 * How close, in SCREEN pixels, a drag must come before a guide captures it.
 *
 * Screen pixels rather than world units, divided by the zoom at use: a fixed
 * world tolerance would grab from across the board when zoomed out and be
 * unreachable when zoomed in.
 */
const ALIGN_TOLERANCE_PX = 6

/**
 * Where a dragged selection actually lands.
 *
 * Alignment to neighbours BEATS the grid, per axis. Lining up with the object
 * next to it is what the user is looking at; the grid is the fallback for an
 * axis nothing is near. Applying both would fight — the grid would drag the
 * selection back off an alignment it had just captured.
 *
 * Cmd/Ctrl suspends both, because it is the "stop helping" key rather than the
 * "grid off" key.
 */
function resolveDragDelta(
  startBounds: Rect | null,
  targets: readonly Rect[],
  raw: Point,
  snapping: boolean,
  zoom: number,
): { x: number; y: number; guides: readonly AlignmentGuide[] } {
  if (!snapping || startBounds === null) return { ...raw, guides: [] }

  const aligned = alignToNeighbours(startBounds, raw, targets, ALIGN_TOLERANCE_PX / zoom)
  const grid = snapDelta(startBounds, aligned.delta)

  return {
    x: aligned.snapped.x ? aligned.delta.x : grid.x,
    y: aligned.snapped.y ? aligned.delta.y : grid.y,
    guides: aligned.guides,
  }
}

/** Reads the handle under the pointer, if the gesture began on one. */
function handleUnderPointer(target: EventTarget | null): string | null {
  if (!(target instanceof HTMLElement)) return null
  return target.closest<HTMLElement>('[data-handle]')?.dataset.handle ?? null
}

/**
 * Sets up a drag of one existing endpoint.
 *
 * Returns `null` — leaving the press to fall through to ordinary handling — if
 * anything about the grab does not add up, rather than starting a gesture that
 * cannot commit.
 *
 * The preview reuses the connect drag: it anchors at the end NOT being dragged,
 * so the line rubber-bands from the fixed end to the pointer exactly as drawing
 * a new connector does, and the object under the pointer highlights for free.
 * Nothing is written until pointer-up (rule 4).
 */
function beginEndpointDrag(
  event: ReactPointerEvent<HTMLElement>,
  store: ReturnType<typeof useInteractionStore.getState>,
  runtime: { store: { getDocument: () => BoardDocument }; registry: ObjectTypeRegistry },
  toWorld: (clientX: number, clientY: number) => Point,
): Gesture | null {
  const element = event.target instanceof HTMLElement ? event.target : null
  const endpointId = element?.closest<HTMLElement>('[data-endpoint-id]')?.dataset.endpointId
  if (endpointId === undefined) return null

  const [selectedId] = [...store.selection]
  const doc = runtime.store.getDocument()
  const object = selectedId === undefined ? undefined : doc.objects.get(selectedId)
  if (object === undefined) return null

  const endpoints = runtime.registry.endpointsOf(object, doc)
  const fixed = endpoints.find((endpoint) => endpoint.id !== endpointId)
  if (fixed === undefined) return null

  const anchor: ConnectorEndpoint =
    fixed.attachedTo === undefined
      ? { kind: 'point', x: fixed.at.x, y: fixed.at.y }
      : { kind: 'object', objectId: fixed.attachedTo, anchor: { kind: 'auto' } }

  const worldStart = toWorld(event.clientX, event.clientY)
  store.beginConnect(anchor, worldStart)

  return {
    pointerId: event.pointerId,
    mode: 'endpoint',
    startWorld: worldStart,
    startClient: { x: event.clientX, y: event.clientY },
    startViewport: store.viewport,
    subjects: [object],
    startBounds: null,
    alignTargets: [],
    handle: null,
    endpointId,
    startAngle: 0,
    moved: false,
  }
}

/**
 * The object whose rendered chrome was pressed, for chrome that sits OUTSIDE
 * the object's world bounds.
 *
 * A frame's title is drawn above the frame and counter-scaled to stay a
 * constant size on screen, so it has no fixed world geometry and world-space
 * hit testing cannot see it — clicking it would deselect instead of selecting.
 * Rather than special-casing frames in the geometry, the DOM answers for the
 * cases only the DOM knows about.
 */
function objectChromeUnderPointer(target: EventTarget | null): ObjectId | null {
  if (!(target instanceof HTMLElement)) return null
  const id = target.closest<HTMLElement>('[data-object-id]')?.dataset.objectId
  return id === undefined ? null : (id as ObjectId)
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
          // Selected as well as edited: a double-click into a group targets the
          // MEMBER, and leaving the group selected while editing a note inside
          // it would show a selection box around the wrong thing.
          store.setSelection([intent.id])
          store.setEditing(intent.id)
          return 'none'
        case 'begin-connect': {
          // Attaching by `auto` rather than a fixed side, so the connector picks
          // the sensible edge as either end moves.
          const from =
            intent.from === null
              ? ({ kind: 'point', x: intent.at.x, y: intent.at.y } as const)
              : ({ kind: 'object', objectId: intent.from, anchor: { kind: 'auto' } } as const)
          store.beginConnect(from, intent.at)
          return 'connect'
        }
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

      if (grabbed === 'endpoint') {
        const started = beginEndpointDrag(event, store, runtime, toWorld)
        if (started !== null) {
          event.currentTarget.setPointerCapture(event.pointerId)
          gesture.current = started
          return
        }
      }

      if (grabbed !== null && grabbed !== 'endpoint') {
        const document = runtime.store.getDocument()
        /*
         * Only the objects a transform can actually act on.
         *
         * A connector is not resizable and has no meaningful frame — a
         * vestigial 0x0 at the origin — so including one would stretch the
         * gesture's bounds all the way back to world zero. It does not need to
         * be transformed anyway: its geometry is derived from its endpoints, so
         * it follows whatever it is attached to for free.
         */
        const subjects = [...store.selection]
          .map((id) => document.objects.get(id))
          .filter((object): object is AnyOpenFrameObject => object !== undefined)
          .filter(
            (object) => runtime.registry.get(object.type)?.capabilities.resizable === true,
          )
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
            alignTargets: [],
            handle: rotating ? null : (grabbed as HandleId),
            endpointId: null,
            startAngle: angleFrom(centre, worldStart) - (subjects[0]?.frame.rotation ?? 0),
            moved: false,
          }
          return
        }
      }

      const worldPoint = toWorld(event.clientX, event.clientY)
      const hitId =
        hitTest(runtime.store.getDocument(), runtime.registry, worldPoint) ??
        objectChromeUnderPointer(event.target)
      const intents = decidePointerDown({
        tool: store.tool,
        worldPoint,
        hitId,
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
        // Re-read: `store` is a snapshot from BEFORE the intents ran, so its
        // selection and viewport are stale by this point.
        const settled = useInteractionStore.getState()
        const doc = runtime.store.getDocument()
        const subjects =
          mode === 'translate'
            ? [...settled.selection]
                .map((id) => doc.objects.get(id))
                .filter((object): object is AnyOpenFrameObject => object !== undefined)
            : []

        gesture.current = {
          pointerId: event.pointerId,
          mode,
          startWorld: worldPoint,
          startClient: { x: event.clientX, y: event.clientY },
          startViewport: settled.viewport,
          subjects,
          // Captured so the whole selection snaps as ONE unit rather than each
          // object independently, which would shuffle them apart.
          startBounds: framesBounds(subjects),
          alignTargets:
            mode === 'translate'
              ? alignmentTargets(
                  doc,
                  runtime.registry,
                  cullToViewport(
                    doc,
                    runtime.registry,
                    visibleWorldRect(settled.viewport, settled.canvasSize.width, settled.canvasSize.height),
                  ),
                  settled.selection,
                )
              : [],
          handle: null,
          endpointId: null,
          startAngle: 0,
          moved: false,
        }
      }
    },
    [applyIntent, runtime, toWorld],
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
        const raw = { x: worldPoint.x - active.startWorld.x, y: worldPoint.y - active.startWorld.y }
        /*
         * Cmd/Ctrl suspends snapping for this gesture without touching the
         * preference — the convention in design tools, and the only override
         * that can be reached while already dragging.
         */
        const snapping = store.snapToGrid && !(event.metaKey || event.ctrlKey)
        const delta = resolveDragDelta(
          active.startBounds,
          active.alignTargets,
          raw,
          snapping,
          store.viewport.zoom,
        )
        store.setGuides(delta.guides)
        store.updateTranslate(delta.x, delta.y)
        return
      }

      if (active.mode === 'marquee') {
        active.moved = true
        store.updateMarquee(worldPoint)
        return
      }

      if (active.mode === 'connect' || active.mode === 'endpoint') {
        active.moved = true
        const over = hitTest(runtime.store.getDocument(), runtime.registry, worldPoint)
        // The object being edited must not offer itself as a target: attaching
        // an end to its own connector is unresolvable, so it would silently
        // become a no-op rather than the free point the drop implied.
        const editing = active.subjects[0]?.id
        store.updateConnect(worldPoint, over === editing ? null : over)
        return
      }

      if (active.mode === 'resize' && active.startBounds !== null && active.handle !== null) {
        active.moved = true
        const delta = {
          x: worldPoint.x - active.startWorld.x,
          y: worldPoint.y - active.startWorld.y,
        }
        const resized = resizeBounds(active.startBounds, active.handle, delta, {
          // Corners keep proportions by default; Shift releases that, matching
          // the convention in design tools.
          preserveAspect: CORNER_HANDLES.includes(active.handle) ? !event.shiftKey : event.shiftKey,
          fromCentre: event.altKey,
        })
        const next =
          store.snapToGrid && !(event.metaKey || event.ctrlKey) ? snapRect(resized) : resized
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
      const worldPointOf = (e: ReactPointerEvent<HTMLElement>): Point =>
        toWorld(e.clientX, e.clientY)
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
        const moves = [...ids].map((id) => ({ id, dx, dy }))
        const document = runtime.store.getDocument()

        /*
         * Dropping onto a frame changes membership. The excluded set is the
         * dragged objects and everything inside them, so a frame cannot be
         * dropped into itself or into its own contents.
         */
        const excluded = new Set<ObjectId>()
        const stack = [...ids]
        while (stack.length > 0) {
          const id = stack.pop()
          if (id === undefined || excluded.has(id)) continue
          excluded.add(id)
          for (const object of document.objects.values()) {
            if (object.parentId === id) stack.push(object.id)
          }
        }

        const target = containerAt(document, runtime.registry, worldPointOf(event), excluded)
        const currentParents = new Set(
          [...ids].map((id) => document.objects.get(id)?.parentId ?? null),
        )
        const membershipChanged = currentParents.size !== 1 || !currentParents.has(target)

        if (membershipChanged) commands.moveAndReparent(moves, target)
        else commands.moveObjects(moves)
      }

      if (
        active.mode === 'endpoint' &&
        active.endpointId !== null &&
        store.drag.kind === 'connect'
      ) {
        const subject = active.subjects[0]
        const { to, over } = store.drag
        if (subject !== undefined && active.moved) {
          commands.retargetEndpoint(
            subject.id,
            active.endpointId,
            over === null ? { kind: 'point', x: to.x, y: to.y } : { kind: 'object', objectId: over },
          )
        }
      }

      if (active.mode === 'connect' && store.drag.kind === 'connect') {
        const { from, to, over } = store.drag
        const target =
          over === null
            ? ({ kind: 'point', x: to.x, y: to.y } as const)
            : ({ kind: 'object', objectId: over, anchor: { kind: 'auto' } } as const)

        // A connector to nowhere from nowhere is a stray click, not a gesture.
        const trivial =
          from.kind === 'point' &&
          target.kind === 'point' &&
          Math.hypot(target.x - from.x, target.y - from.y) < 8
        if (!trivial) {
          const id = commands.createConnector(from, target)
          if (id !== null) {
            store.setSelection([id])
            store.setTool('select')
          }
        }
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
    [commands, runtime.registry, runtime.store, toWorld],
  )

  const onDoubleClick = useCallback(
    // Double-click arrives as a MouseEvent in React, not a PointerEvent.
    (event: ReactMouseEvent<HTMLElement>): void => {
      const worldPoint = toWorld(event.clientX, event.clientY)
      /*
       * RAW, not group-resolved.
       *
       * A single click selects the group, which is what a group is for; a
       * double-click is the gesture for reaching inside it. Without this a note
       * inside a group could never be edited again, because every click would
       * resolve to a container that has no text.
       */
      const hitId =
        hitTestRaw(runtime.store.getDocument(), runtime.registry, worldPoint) ??
        objectChromeUnderPointer(event.target)
      for (const intent of decideDoubleClick(hitId)) applyIntent(intent, worldPoint)
    },
    [applyIntent, runtime.registry, runtime.store, toWorld],
  )

  const onContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>): void => {
      event.preventDefault()
      const store = useInteractionStore.getState()
      const worldPoint = toWorld(event.clientX, event.clientY)
      const hit =
        hitTest(runtime.store.getDocument(), runtime.registry, worldPoint) ??
        objectChromeUnderPointer(event.target)

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
