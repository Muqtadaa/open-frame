import {
  screenToWorld,
  unionAll,
  worldRectToScreen,
  type AnyOpenFrameObject,
  type Point,
} from '@openframe/core'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'

import { useOpenFrame } from '../runtime/context.js'
import { pinFraction } from '../scene/comment-pin.js'
import { pinchViewport, type PinchStart } from '../scene/pinch.js'
import { makeFor } from '../scene/tools.js'
import { useCommands } from '../hooks/use-commands.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import {
  onDoubleClick as decideDoubleClick,
  onPointerDown as decidePointerDown,
  type PointerIntent,
} from '../interaction/pointer-controller.js'
import { hitTest, hitTestRaw } from '../scene/hit-testing.js'
import { boundsOfAll } from '../scene/resize.js'
import { beginConnectPointDrag } from './gestures/connect.js'
import { beginCropDrag } from './gestures/crop.js'
import { beginDividerDrag } from './gestures/divider.js'
import { beginEndpointDrag } from './gestures/endpoint.js'
import { HANDLERS } from './gestures/index.js'
import {
  claimsDoubleClick,
  handleAt,
  handleUnderPointer,
  isTextEntry,
  lockedAmong,
  objectChromeUnderPointer,
} from './gestures/targets.js'
import { beginTransformDrag } from './gestures/transform.js'
import type { Gesture, GestureContext, GestureMode } from './gestures/types.js'

/**
 * Turns raw pointer input into store updates and commands.
 *
 * The decision of what a gesture MEANS lives in `pointer-controller.ts` as pure
 * functions; this hook only performs the effects. Keeping the two apart is what
 * lets interaction rules be tested without synthesising DOM events.
 *
 * Nothing here writes to the document except on pointer-up.
 *
 * What each MODE does once it is running — its preview and its one commit —
 * lives in `gestures/`, one module apiece, and this hook dispatches to it.
 * What stays here is what belongs to no mode: deciding what a press is,
 * touch and pinch, and putting a gesture back when it is interrupted.
 */
export function useCanvasGestures(containerRef: RefObject<HTMLElement | null>) {
  const { runtime, views } = useOpenFrame()
  const commands = useCommands()
  const gesture = useRef<Gesture | null>(null)

  /*
   * ESCAPE CANCELS A GESTURE IN FLIGHT: whatever was being dragged goes back
   * where it was, nothing is written, and the selection it was about stays.
   * It used to reach the keymap instead, which cleared the selection while the
   * drag carried on and committed on release.
   *
   * Capture phase on the window, so this runs before the keymap's own Escape
   * and can keep it from also letting go of the selection.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || gesture.current === null) return
      gesture.current = null
      useInteractionStore.getState().endDrag()
      event.preventDefault()
      event.stopPropagation()
    }
    /*
     * A window that loses focus mid-gesture — a system dialog, a switch of
     * app — will never send the pointer-up. The gesture is put back, as
     * Escape would, rather than left running for a release that never comes.
     */
    const onBlur = (): void => {
      if (gesture.current === null) return
      gesture.current = null
      useInteractionStore.getState().endDrag()
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  /*
   * FINGERS ON THE BOARD, by pointer id, in canvas pixels.
   *
   * `touch-action: none` on the canvas turns off the browser's own pinch so a
   * one-finger drag can move an object instead of scrolling the page — and
   * nothing replaced it, so a board on a phone could not be zoomed with the
   * hand at all. Two fingers now pinch AND pan in one gesture (`pinchViewport`),
   * and a second finger landing mid-drag puts the drag back, as Escape does,
   * rather than taking it over.
   */
  const touches = useRef(new Map<number, Point>())
  /*
   * A pinch belongs to the TWO fingers that began it, named by pointer id. It
   * used to read "the first two touches on the board", so with a third finger
   * down, lifting one of the pair left two touches and the pinch carried on,
   * measuring a finger it never started with against a start that held one
   * that had gone — and the view leapt (Codex, on #11).
   */
  const pinch = useRef<{
    readonly start: PinchStart
    readonly ids: readonly [number, number]
  } | null>(null)
  /*
   * Begins a pinch from the first two fingers now on the board, at the view as
   * it is; with fewer than two there is none. Called when a second finger
   * lands, and again when one of a pinch's own fingers lifts, so the two that
   * remain carry on from where the board is rather than from a stale start.
   */
  const beginPinch = useCallback((): void => {
    const [first, second] = [...touches.current.entries()]
    pinch.current =
      first === undefined || second === undefined
        ? null
        : {
            start: { viewport: useInteractionStore.getState().viewport, a: first[1], b: second[1] },
            ids: [first[0], second[0]],
          }
  }, [])
  /* A finger has left the board: a pinch it was part of starts again. */
  const liftFinger = useCallback(
    (pointerId: number): void => {
      touches.current.delete(pointerId)
      if (pinch.current?.ids.includes(pointerId) === true) beginPinch()
    },
    [beginPinch],
  )
  const canvasPoint = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = containerRef.current?.getBoundingClientRect()
      return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) }
    },
    [containerRef],
  )
  /** Puts back whatever one-finger gesture was running, writing nothing. */
  const abandon = useCallback((): void => {
    if (gesture.current === null) return
    gesture.current = null
    useInteractionStore.getState().endDrag()
  }, [])
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

  /** What every mode is handed. */
  const context = useMemo<GestureContext>(
    () => ({ runtime, commands, toWorld }),
    [runtime, commands, toWorld],
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
        case 'begin-edit': {
          /*
           * A type that can never be opened says why, rather than the gesture
           * that opens everything else doing nothing at all. Asked of the
           * registry, so the canvas names no type.
           */
          const target = runtime.store.getDocument().objects.get(intent.id)
          const refusal =
            target === undefined ? undefined : runtime.registry.describeObject(target).cannotEdit
          if (refusal !== undefined) {
            store.setSelection([intent.id])
            store.showToast(refusal)
            return 'none'
          }
          // Selected as well as edited: a double-click into a group targets the
          // MEMBER, and leaving the group selected while editing a note inside
          // it would show a selection box around the wrong thing.
          store.setSelection([intent.id])
          // The point comes along so a type whose editor has more than one
          // place to put a caret can put it where the pointer was.
          store.setEditing(intent.id, worldPoint)
          return 'none'
        }
        case 'begin-connect': {
          // Attaching by `auto` rather than a fixed side, so the connector picks
          // the sensible edge as either end moves.
          const from =
            intent.from === null
              ? ({ kind: 'point', x: intent.at.x, y: intent.at.y } as const)
              : ({ kind: 'object', objectId: intent.from, anchor: { kind: 'auto' } } as const)
          store.beginConnect(from, intent.at, {
            type: intent.objectType,
            ...(intent.data === undefined ? {} : { data: intent.data }),
          })
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

      if (event.pointerType === 'touch') {
        touches.current.set(event.pointerId, canvasPoint(event.clientX, event.clientY))
        if (touches.current.size >= 2) {
          // A second finger: this is a pinch, and whatever the first began
          // is put back rather than committed.
          abandon()
          // A third finger joins nothing: the pinch keeps its own two.
          if (pinch.current === null) beginPinch()
          event.currentTarget.setPointerCapture(event.pointerId)
          event.preventDefault()
          return
        }
      } else if (gesture.current !== null) {
        // A second pointer of any other kind never takes over the first.
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
      /*
       * And the board takes the keyboard, which `preventDefault` above stopped
       * the browser doing: a click then Tab started again at the top of the
       * page. Anything opened by this gesture — a note's editor — focuses
       * itself afterwards, so this never takes the caret away from it.
       */
      event.currentTarget.focus({ preventScroll: true })

      const grabbed = handleUnderPointer(event.target)
      /*
       * Remembered for the `dblclick` that may follow this press: by then the
       * handle can have moved out from under the pointer, and a double-click
       * on a handle that has its own meaning must never also reach the object
       * beneath it.
       */
      pressedHandle.current = claimsDoubleClick(grabbed)

      /*
       * A press on a HANDLE starts the gesture that handle belongs to. Each is
       * the mode's own to set up; null means the grab did not add up, and the
       * press falls through to ordinary handling.
       */
      const started =
        grabbed === 'crop'
          ? beginCropDrag(context, event, store)
          : grabbed === 'divider'
            ? beginDividerDrag(context, event, store)
            : grabbed === 'endpoint'
              ? beginEndpointDrag(context, event, store)
              : grabbed === 'connect'
                ? beginConnectPointDrag(context, event, store)
                : grabbed === null
                  ? null
                  : beginTransformDrag(context, event, store, grabbed)
      if (started !== null) {
        event.currentTarget.setPointerCapture(event.pointerId)
        gesture.current = started
        return
      }

      const worldPoint = toWorld(event.clientX, event.clientY)
      const document = runtime.store.getDocument()
      const hitId =
        hitTest(document, runtime.registry, worldPoint) ?? objectChromeUnderPointer(event.target)
      const intents = decidePointerDown({
        tool: store.tool,
        worldPoint,
        hitId,
        selection: store.selection,
        shiftKey: event.shiftKey,
        button: event.button,
        spaceHeld: spaceHeld.current,
        make: makeFor(store.tool, views.tools(), store.toolOptions),
        /*
         * Only what a press could actually move: the object under the pointer
         * and whatever is already selected. Walking the whole document to
         * build this would be an O(n) scan on every press, which rule 10
         * forbids for exactly this kind of convenience.
         */
        locked: lockedAmong(document, [hitId, ...store.selection]),
      })

      let mode: GestureMode = 'none'
      for (const intent of intents) {
        const next = applyIntent(intent, worldPoint)
        if (next !== null) mode = next
      }

      if (mode === 'none') return
      event.currentTarget.setPointerCapture(event.pointerId)
      // Re-read: `store` is a snapshot from BEFORE the intents ran, so its
      // selection and viewport are stale by this point.
      const settled = useInteractionStore.getState()
      const doc = runtime.store.getDocument()
      // What the mode snapshots at its start: anything a gesture compares
      // against is taken HERE, never per pointer event (rule 17).
      const prepared = HANDLERS[mode].prepare?.(context, settled) ?? {
        subjects: [],
        alignTargets: [],
      }

      gesture.current = {
        pointerId: event.pointerId,
        mode,
        startWorld: worldPoint,
        startClient: { x: event.clientX, y: event.clientY },
        startViewport: settled.viewport,
        subjects: prepared.subjects,
        // Captured so the whole selection snaps as ONE unit rather than each
        // object independently, which would shuffle them apart. Measured by
        // each object's own bounds: a selected connector's frame sits at
        // world zero, and the selection snapped as if it began there.
        startBounds: boundsOfAll(prepared.subjects, (object) =>
          runtime.registry.drawnFromEnds(object) ? null : runtime.registry.boundsOf(object, doc),
        ),
        alignTargets: prepared.alignTargets,
        handle: null,
        endpointId: null,
        startAngle: 0,
        moved: false,
      }
    },
    [abandon, applyIntent, beginPinch, canvasPoint, context, runtime, toWorld, views],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      const store = useInteractionStore.getState()
      if (event.pointerType === 'touch' && touches.current.has(event.pointerId)) {
        touches.current.set(event.pointerId, canvasPoint(event.clientX, event.clientY))
        const started = pinch.current
        if (started !== null) {
          const a = touches.current.get(started.ids[0])
          const b = touches.current.get(started.ids[1])
          if (a !== undefined && b !== undefined) {
            store.setViewport(pinchViewport(started.start, a, b))
          }
          return
        }
      }
      const active = gesture.current

      if (active === null) {
        const worldPoint = toWorld(event.clientX, event.clientY)
        store.setHovered(hitTest(runtime.store.getDocument(), runtime.registry, worldPoint))
        // For chrome that only appears when you reach for it — a connector's
        // midpoint handles. Only between gestures: during one, what matters is
        // where the drag is, and that is the drag's own business.
        store.setPointer(worldPoint)
        return
      }

      HANDLERS[active.mode].move(
        context,
        active,
        event,
        toWorld(event.clientX, event.clientY),
        store,
      )
    },
    [canvasPoint, context, runtime, toWorld],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      if (event.pointerType === 'touch') {
        const pinching = pinch.current !== null
        liftFinger(event.pointerId)
        if (pinching) {
          // A finger left behind alone starts nothing until it too is lifted.
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
          return
        }
      }
      const active = gesture.current
      gesture.current = null
      if (active === null) return
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }

      const store = useInteractionStore.getState()

      // THE COMMIT. One command for the whole gesture, whatever its length,
      // and the drag state ended after it whatever the mode.
      HANDLERS[active.mode].commit(context, active, event, store)
      store.endDrag()
    },
    [context, liftFinger],
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
      if (pressedHandle.current || claimsDoubleClick(handleAt(event.clientX, event.clientY))) return

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

      /*
       * A type that shows LESS than it holds is cropped by this gesture rather
       * than edited by it, asked of the registry rather than compared against
       * 'image'. Nothing else in the product declares a crop window, so
       * nothing else changes — and the next type that does gets the gesture by
       * saying so.
       */
      if (hitId !== null) {
        const object = runtime.store.getDocument().objects.get(hitId)
        if (
          object !== undefined &&
          !object.locked &&
          runtime.registry.cropWindowOf(object) !== null
        ) {
          const store = useInteractionStore.getState()
          store.setSelection([hitId])
          store.setCropping(hitId)
          return
        }
      }

      for (const intent of decideDoubleClick(hitId)) applyIntent(intent, worldPoint)
    },
    [applyIntent, runtime.registry, runtime.store, toWorld],
  )

  const onContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>): void => {
      event.preventDefault()
      const store = useInteractionStore.getState()
      /*
       * From the KEYBOARD — Shift+F10 or the menu key — the browser still
       * sends a contextmenu event, with `button` -1 rather than 2 and a
       * position at the corner of whatever had focus. Hit testing that point
       * would select whatever happened to be there; the menu belongs on what
       * is already selected, or mid-board when nothing is.
       */
      if (event.button !== 2) {
        const rect = containerRef.current?.getBoundingClientRect()
        const left = rect?.left ?? 0
        const top = rect?.top ?? 0
        const doc = runtime.store.getDocument()
        const selected = unionAll(
          [...store.selection]
            .map((id) => doc.objects.get(id))
            .filter((object): object is AnyOpenFrameObject => object !== undefined)
            .map((object) => runtime.registry.boundsOf(object, doc)),
        )
        const box =
          selected === null
            ? { x: store.canvasSize.width / 2, y: store.canvasSize.height / 2, width: 0, height: 0 }
            : worldRectToScreen(store.viewport, selected)
        store.openContextMenu({
          ...box,
          x: box.x + left,
          y: box.y + top,
          via: 'keyboard',
          world: screenToWorld(store.viewport, {
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
          }),
        })
        return
      }
      const worldPoint = toWorld(event.clientX, event.clientY)
      const hit =
        hitTest(runtime.store.getDocument(), runtime.registry, worldPoint) ??
        objectChromeUnderPointer(event.target)

      // Right-clicking an unselected object selects it first, so the menu always
      // acts on what the user pointed at.
      if (hit !== null && !store.selection.has(hit)) store.setSelection([hit])
      if (hit === null) store.clearSelection()

      store.openContextMenu({
        x: event.clientX,
        y: event.clientY,
        width: 0,
        height: 0,
        via: 'pointer',
        world: worldPoint,
      })
    },
    [containerRef, runtime.registry, runtime.store, toWorld],
  )

  const setSpaceHeld = useCallback((held: boolean): void => {
    spaceHeld.current = held
  }, [])

  /*
   * The pointer is nowhere once it has left, which is not the same as being
   * where it last was. Chrome that appears only under the pointer would
   * otherwise hang over the board after the hand had gone.
   */
  /*
   * A CANCELLED pointer puts the gesture back. The browser sends
   * `pointercancel` when something else takes the pointer — an incoming call,
   * a palm, the system claiming the touch — and it was wired to pointer-up,
   * which COMMITTED a half-finished move. Escape already put a gesture back;
   * an interruption the person did not choose now does the same.
   */
  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      liftFinger(event.pointerId)
      abandon()
    },
    [abandon, liftFinger],
  )

  /*
   * Capture lost without a release — the element holding it went away, or the
   * browser took it back. Pointer-up clears the gesture before it releases
   * capture, so this only ever finds one that was interrupted.
   */
  const onLostPointerCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      const pinching = pinch.current !== null
      liftFinger(event.pointerId)
      if (pinching) return
      abandon()
    },
    [abandon, liftFinger],
  )

  const onPointerLeave = useCallback((): void => {
    useInteractionStore.getState().setPointer(null)
  }, [])

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture,
    onPointerLeave,
    onDoubleClick,
    onContextMenu,
    setSpaceHeld,
  }
}
