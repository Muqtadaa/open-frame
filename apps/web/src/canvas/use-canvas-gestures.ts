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
import { pinFraction } from '../scene/comment-pin.js'
import { useCommands } from '../hooks/use-commands.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import {
  exceedsDragThreshold,
  onDoubleClick as decideDoubleClick,
  onPointerDown as decidePointerDown,
  type PointerIntent,
} from '../interaction/pointer-controller.js'
import { anchorForSide } from './ConnectPoints.js'
import { committedRect, constrainToAxis } from '../scene/draw.js'
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
  /** Sweeping out a NEW object's size, before anything exists. */
  | 'draw'
  | 'resize'
  | 'rotate'
  | 'connect'
  /** Dragging one END of an already-existing object, rather than drawing a new one. */
  | 'endpoint'
  /** Dragging a division INSIDE one — a table's column or row boundary. */
  | 'divider'
  | 'none'

/**
 * Pointer events originating in a text control, or in the chrome that drives
 * one, belong to that control.
 *
 * The format bar counts. It lives INSIDE the canvas, beside the editor it acts
 * on, so without this a press on "bold" reads as a canvas gesture: the handler
 * below blurs the active element, the editor commits and unmounts, and the mark
 * is then applied to a selection that no longer exists. The symptom is a button
 * that silently does nothing while the same action from the keyboard works.
 */
/**
 * Chrome that belongs to an OPEN EDITOR, marked with one class rather than
 * listed here by name.
 *
 * The same bug has now been found three times: the format bar, a table's add
 * and remove buttons, and a code block's language menu. Each time, pressing
 * the control read as a canvas gesture — the handler below ends the edit, the
 * editor commits and unmounts, and the press lands on nothing. The symptom is
 * a control that silently does nothing.
 *
 * The marker goes on the EDITOR, not on each control, so the next thing added
 * inside one is covered without anybody remembering to do it. That is the
 * difference between a rule and a list of the places it was applied.
 */
const EDITOR_CHROME = '.of-editor-chrome'

function isTextEntry(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) return true
  if (target instanceof HTMLElement && target.isContentEditable) return true
  /*
   * `Element`, NOT `HTMLElement`.
   *
   * A control whose face is a drawn icon puts an `SVGElement` under the
   * pointer, and an SVGElement is not an HTMLElement — so the chrome check
   * never ran for it, the canvas read the press as a board gesture, and the
   * selection was cleared. The apparatus then unmounted between `pointerdown`
   * and `click`, which means the click event never fired at all: a button that
   * looks fine, highlights on hover, and does nothing.
   *
   * The fifth appearance of this family of fault, and the first one where the
   * marker was present and correct — it was the type test that let the press
   * through.
   */
  return target instanceof Element && target.closest(EDITOR_CHROME) !== null
}

interface Gesture {
  readonly pointerId: number
  readonly mode: GestureMode
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
  /** Which end is being dragged, in the owning type's own naming. */
  readonly endpointId: string | null
  readonly startAngle: number
  moved: boolean
}

/**
 * How close, in SCREEN pixels, a drag must come before a divider captures it.
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
 * The handle at a point on screen, if any.
 *
 * `handleUnderPointer` reads the event's target, which is right for a press —
 * a `pointerdown` is addressed to exactly what it landed on. A `dblclick` is
 * not: it targets the nearest common ancestor of its two clicks, so one that
 * begins on a handle and ends on what is beneath arrives addressed to the
 * canvas, and the handle is invisible to it.
 */
function handleAt(clientX: number, clientY: number): string | null {
  if (typeof window === 'undefined') return null
  return handleUnderPointer(window.document.elementFromPoint(clientX, clientY))
}

/**
 * Grabbing a division inside an object, which the REGISTRY named.
 *
 * Nothing type-specific here: the handle carries its own id, the registry
 * turns a position into a data patch, and this only has to know that both
 * exist. The same handshake the endpoint handles use.
 */
function beginDividerDrag(
  event: ReactPointerEvent<HTMLElement>,
  store: ReturnType<typeof useInteractionStore.getState>,
  runtime: { store: { getDocument: () => BoardDocument }; registry: ObjectTypeRegistry },
  toWorld: (clientX: number, clientY: number) => Point,
): Gesture | null {
  const element = event.target instanceof HTMLElement ? event.target : null
  const dividerId = element?.closest<HTMLElement>('[data-divider-id]')?.dataset.dividerId
  if (dividerId === undefined) return null

  const [selectedId] = [...store.selection]
  const doc = runtime.store.getDocument()
  const object = selectedId === undefined ? undefined : doc.objects.get(selectedId)
  if (object === undefined || selectedId === undefined) return null

  store.beginDivider(selectedId, dividerId)

  return {
    pointerId: event.pointerId,
    mode: 'divider',
    startWorld: toWorld(event.clientX, event.clientY),
    startClient: { x: event.clientX, y: event.clientY },
    startViewport: store.viewport,
    subjects: [object],
    startBounds: runtime.registry.boundsOf(object, doc),
    alignTargets: [],
    handle: null,
    endpointId: null,
    dividerId,
    startAngle: 0,
    moved: false,
  }
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
  /**
   * Whether the last press landed on a handle.
   *
   * Read by the double-click handler, which cannot work it out for itself: see
   * the note there.
   */
  const pressedHandle = useRef(false)
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
        /*
         * Opens a composer where the pointer is. Nothing is written yet and
         * nothing touches the document: a comment is not a canvas object, and
         * it does not exist until somebody has actually said something.
         */
        case 'drop-comment': {
          /*
           * The element's bounds come from the registry, never from
           * `object.frame`: a connector has no meaningful frame, and asking
           * for one gives a degenerate box at the origin — so a comment
           * dropped on a connector would anchor to nowhere.
           */
          const doc = runtime.store.getDocument()
          const on = intent.on === null ? null : doc.objects.get(intent.on)
          store.startComment({
            x: worldPoint.x,
            y: worldPoint.y,
            objectId: intent.on,
            on:
              on === undefined || on === null
                ? null
                : pinFraction(worldPoint, runtime.registry.boundsOf(on, doc)),
          })
          return 'none'
        }
        case 'begin-marquee':
          store.beginMarquee(worldPoint)
          return 'marquee'
        case 'begin-draw':
          store.beginDraw(intent.objectType, intent.at, intent.data)
          return 'draw'
        case 'begin-edit':
          // Selected as well as edited: a double-click into a group targets the
          // MEMBER, and leaving the group selected while editing a note inside
          // it would show a selection box around the wrong thing.
          store.setSelection([intent.id])
          // The point comes along so a type whose editor has more than one
          // place to put a caret can put it where the pointer was.
          store.setEditing(intent.id, worldPoint)
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
    [commands, runtime.registry, runtime.store],
  )

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      /*
       * An inline editor lives INSIDE the canvas, so its pointer events bubble
       * up to here. Without this guard, clicking into a note to reposition the
       * caret would be read as a canvas gesture and close the editor.
       */
      if (isTextEntry(event.target)) return

      /*
       * A comment pin lives inside the world layer, so its events bubble here
       * too — and in select mode this handler takes pointer capture to start a
       * marquee, which swallows the pin's own click. The pin was therefore
       * clickable only while the comment tool happened to be active, which is
       * the one mode you are least likely to be in when you want to READ a
       * comment.
       *
       * Found by a test that switched tools before clicking the pin. The
       * earlier ones passed because they never left comment mode.
       */
      if (event.target instanceof Element && event.target.closest('.of-comments') !== null) {
        return
      }

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
      /*
       * Commit whatever was being typed, WHEREVER it lives.
       *
       * Every text control in this app writes on blur, and `preventDefault`
       * above stops the browser moving focus — so unless the blur is done
       * explicitly here, nothing commits. This used to be gated on
       * `editingId`, which only covers the editor inside an object: a source or
       * a tag typed into the record panel kept focus, was never written, and
       * was discarded the moment the selection changed. Losing what someone
       * typed is the one unacceptable failure.
       */
      const active = window.document.activeElement
      if (active instanceof HTMLElement && isTextEntry(active)) active.blur()
      else if (store.editingId !== null) store.setEditing(null)

      const grabbed = handleUnderPointer(event.target)
      /*
       * Remembered for the `dblclick` that may follow this press: by then the
       * handle can have moved out from under the pointer, and a double-click
       * on a handle must never also reach the object beneath it.
       */
      pressedHandle.current = grabbed !== null

      if (grabbed === 'divider') {
        const started = beginDividerDrag(event, store, runtime, toWorld)
        if (started !== null) {
          event.currentTarget.setPointerCapture(event.pointerId)
          gesture.current = started
          return
        }
      }

      if (grabbed === 'endpoint') {
        const started = beginEndpointDrag(event, store, runtime, toWorld)
        if (started !== null) {
          event.currentTarget.setPointerCapture(event.pointerId)
          gesture.current = started
          return
        }
      }

      /*
       * Dragging off a connection point draws a connector FROM that object,
       * attached at the side the point sits on. Starting a line at the right
       * edge and having it leave from the left is the kind of thing that makes
       * a tool feel like it is arguing with you.
       */
      if (grabbed === 'connect') {
        const side =
          event.target instanceof Element
            ? (event.target.closest<HTMLElement>('[data-connect-side]')?.dataset.connectSide ??
              null)
            : null
        const [subject] = [...store.selection]
        if (subject !== undefined && side !== null) {
          const at = toWorld(event.clientX, event.clientY)
          store.beginConnect(
            { kind: 'object', objectId: subject, anchor: anchorForSide(side) },
            at,
          )
          event.currentTarget.setPointerCapture(event.pointerId)
          gesture.current = {
            pointerId: event.pointerId,
            mode: 'connect',
            startWorld: at,
            startClient: { x: event.clientX, y: event.clientY },
            startViewport: store.viewport,
            subjects: [],
            startBounds: null,
            alignTargets: [],
            handle: null,
            endpointId: null,
            startAngle: 0,
            moved: false,
          }
          return
        }
      }

      if (
        grabbed !== null &&
        grabbed !== 'endpoint' &&
        grabbed !== 'connect' &&
        grabbed !== 'divider'
      ) {
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
        tableSize: store.tableSize,
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

      if (active.mode === 'divider') {
        const bounds = active.startBounds
        const [subject] = active.subjects
        if (bounds === null || subject === undefined || active.dividerId === undefined) return

        /*
         * The pointer as a FRACTION of the object, which is the only unit the
         * type understands. Bounds are the ones taken at gesture start: rule
         * 17's reasoning, and here also because nothing has moved — the
         * document is untouched until the pointer comes up.
         */
        const along =
          bounds.width === 0 || bounds.height === 0
            ? 0
            : active.dividerId.startsWith('c')
              ? (worldPoint.x - bounds.x) / bounds.width
              : (worldPoint.y - bounds.y) / bounds.height

        const moved = runtime.registry.moveDivider(subject, active.dividerId, along)
        if (moved !== null) {
          active.moved = true
          /*
           * The data AND the size it needs. Resizing one track no longer takes
           * the space from its neighbour, so the table itself grows — and the
           * preview has to show that, or the drag looks like it is doing
           * nothing past the point the old model would have stopped at.
           */
          store.previewDivider(moved.data, moved.grow)
        }
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

      if (active.mode === 'draw') {
        active.moved = true
        // Shift is read per FRAME, not at gesture start: a user decides a shape
        // should be square halfway through drawing it, which is exactly when
        // they reach for the key.
        store.updateDraw(worldPoint, event.shiftKey)
        return
      }

      if (active.mode === 'connect' || active.mode === 'endpoint') {
        active.moved = true
        /*
         * Shift holds the connector to one axis, as it does in every graphics
         * tool. The hit test uses the CONSTRAINED point, not the raw pointer:
         * attaching to whatever happens to be under the cursor while the drawn
         * line points somewhere else would make the connector attach to
         * something it visibly does not touch.
         */
        const free = event.shiftKey ? constrainToAxis(active.startWorld, worldPoint) : worldPoint
        const over = hitTest(runtime.store.getDocument(), runtime.registry, free)
        // The object being edited must not offer itself as a target: attaching
        // an end to its own connector is unresolvable, so it would silently
        // become a no-op rather than the free point the drop implied.
        const editing = active.subjects[0]?.id
        store.updateConnect(free, over === editing ? null : over)
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

      /*
       * THE COMMIT for a divider: one command carrying the whole drag.
       *
       * Read from the live drag state rather than recomputed here, so what is
       * written is exactly what was on screen — and `moved` gates it, because
       * a press that never moved is a click on a handle, not a resize, and
       * must not put an entry in the undo stack.
       */
      if (active.mode === 'divider') {
        const drag = store.drag
        const subject = active.subjects[0]
        if (drag.kind === 'divider' && drag.data !== null && active.moved && subject !== undefined) {
          /*
           * ONE transaction for the two changes. Weights are data and a frame
           * is geometry, so they are two commands — but they are one action,
           * and undoing a drag has to put both back.
           */
          commands.resizeDivider(drag.objectId, drag.data, {
            ...subject.frame,
            width: subject.frame.width + drag.grow.width,
            height: subject.frame.height + drag.grow.height,
          })
        }
        store.endDrag()
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
            /*
             * The drop POINT travels either way. A type that attaches cares
             * only what was under the pointer; a dragged point that attaches
             * to nothing — a connector's bend — needs where the pointer
             * actually was, and objects cover most of a working board.
             */
            over === null
              ? { kind: 'point', x: to.x, y: to.y }
              : { kind: 'object', objectId: over, x: to.x, y: to.y },
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

      if (active.mode === 'draw' && store.drag.kind === 'draw') {
        const { objectType, data, origin, current, constrained } = store.drag
        const rect = committedRect(origin, current, constrained, store.snapToGrid)
        /*
         * A gesture too small to be a drag falls back to click-to-place, at the
         * type's own default size and centred where the pointer went down. The
         * shape tool must still work with a single click.
         */
        const id =
          rect === null
            ? commands.createObject(objectType, origin, data)
            : commands.createObjectInRect(objectType, rect, data)
        if (id !== null) {
          store.setSelection([id])
          /*
           * Back to the select tool, exactly as click-to-place does. Without
           * this the shape tool stays armed and the very next click — the one
           * that commits the label you just typed — draws a second shape.
           */
          store.setTool('select')
          // The next thing anyone does with a new shape or frame is name it.
          store.setEditing(id)
        }
        store.endDrag()
        return
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
      /*
       * A HANDLE is not the object under it.
       *
       * Double-clicking a table's column boundary fits that column to its
       * content, and the boundary lies over the cells — so hit testing the
       * point finds the table and opens its editor on top of the thing that
       * just happened.
       *
       * Neither `event.target` nor the point can answer this on its own. A
       * `dblclick` targets the nearest common ancestor of its two clicks, so a
       * pair landing on a handle and then on what is under it arrives
       * addressed to the canvas — and by the time it arrives the handle may
       * have MOVED, because fitting a column to its content is exactly what
       * the second press just did.
       *
       * What was under the pointer when it went down is the thing that was
       * true, so that is what is remembered.
       */
      if (pressedHandle.current || handleAt(event.clientX, event.clientY) !== null) return

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
