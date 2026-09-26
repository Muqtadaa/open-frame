import { useEffect } from 'react'

import type { ObjectId } from '@openframe/core'

import { useOpenFrame } from '../runtime/context.js'
import {
  fitToDocument,
  fitToObjects,
  nextZoomIn,
  nextZoomOut,
  zoomAtCentre,
} from '../scene/zoom.js'
import { useCommands } from '../hooks/use-commands.js'
import { useInteractionStore } from './interaction-store.js'
import { resolveKeyAction } from './keymap.js'

/** The smallest a keyboard resize makes a side, in world units. */
const MIN_SIDE = 10
/** How far apart two tops can be and still read as one row, in world units. */
const ROW_BAND = 40

/** An angle in (-π, π], so a keyboard turn never accumulates whole revolutions. */
function normalise(radians: number): number {
  const turn = Math.PI * 2
  const wrapped = ((radians % turn) + turn) % turn
  return wrapped > Math.PI ? wrapped - turn : wrapped
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

const OPERABLE =
  'button, a[href], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="gridcell"], [role="radio"], [role="option"], [role="tab"]'

/**
 * Space and Enter PRESS a control that a keyboard has focused, and the board
 * must not take them first.
 *
 * The keymap claimed both — Space for the pan hold, Enter to edit the
 * selection — and prevented them, so no rail button could be pressed without
 * a mouse and the table size and image import had no keyboard route at all.
 *
 * Only when the KEYBOARD put focus there: a click leaves focus on the button
 * it pressed, and the Space held a moment later to pan the board is the
 * board's. `:focus-visible` cannot tell the two apart, because the browser
 * turns it on for the clicked button the moment any key goes down.
 */
function isOperable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches(OPERABLE)
}

/**
 * Binds the keymap to the window.
 *
 * Every action here goes through the same command layer as the pointer — there
 * is no keyboard path that skips validation, authorization or history.
 *
 * Anything the keymap claims is `preventDefault`ed. That is what stops
 * Cmd/Ctrl +/- and Cmd/Ctrl+0 from zooming the *browser* on top of the canvas,
 * which makes the view unusable within a couple of presses.
 */
export function useKeyboardShortcuts(setSpaceHeld: (held: boolean) => void): void {
  const commands = useCommands()
  const { runtime } = useOpenFrame()

  useEffect(() => {
    /*
     * Whether the control with focus got it from the POINTER. A focus move
     * takes its source from the last input: a click leaves focus pointer-led,
     * so the Space held to pan a moment later is the board's; focus that the
     * interface hands back after a keyboard edit — Enter on the board's name —
     * is the keyboard's, so Enter presses what it lands on. That handed-back
     * focus used to inherit the click that opened the field, and Enter on it
     * did nothing.
     */
    let pointerLed = false
    let lastInput: 'pointer' | 'keyboard' = 'keyboard'
    const onPointerDown = (): void => {
      pointerLed = true
      lastInput = 'pointer'
    }
    // Capture phase: a field that stops its keys (the board's name does)
    // must still count as the keyboard having been used.
    const onAnyKey = (): void => {
      lastInput = 'keyboard'
    }
    const onFocusIn = (): void => {
      pointerLed = lastInput === 'pointer'
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      const store = useInteractionStore.getState()

      if (event.key === 'Tab') pointerLed = false
      if (
        !pointerLed &&
        (event.code === 'Space' || event.key === 'Enter') &&
        isOperable(event.target)
      )
        return

      // Space-drag panning is a hold, not a shortcut, so it sits outside the keymap.
      if (event.code === 'Space' && !isTextEntry(event.target)) {
        setSpaceHeld(true)
        if (!event.repeat) event.preventDefault()
        return
      }

      // Never steal keys from a field the user is typing in — except Escape,
      // which must always be able to end editing.
      if (isTextEntry(event.target) && event.key !== 'Escape') return

      /*
       * TAB WALKS THE BOARD while the board has focus: the next object in
       * reading order, or the previous one with Shift, selected and brought
       * into view. Past the last one it lets Tab go, so the keyboard is never
       * trapped on the board. Objects could not be reached from the keyboard
       * at all — Tab went from the navigation bar through the rail and out.
       */
      if (
        event.key === 'Tab' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.target instanceof HTMLElement &&
        event.target.dataset.testid === 'canvas'
      ) {
        const order = readingOrder()
        const [current] = [...store.selection]
        const at = current === undefined ? -1 : order.indexOf(current)
        const next =
          current === undefined
            ? event.shiftKey
              ? order[order.length - 1]
              : order[0]
            : order[at + (event.shiftKey ? -1 : 1)]
        if (next === undefined) return
        event.preventDefault()
        commands.reveal(next)
        return
      }

      const action = resolveKeyAction(event)
      if (action === null) return
      event.preventDefault()

      const { width, height } = store.canvasSize

      switch (action.kind) {
        case 'tool': {
          store.setTool(action.tool)
          /*
           * M with something selected starts a comment ON it, at its top
           * right corner — the keyboard's way to write one. A comment could
           * only be dropped with a pointer, so somebody working without one
           * could read every discussion and never join any.
           */
          const [first] = [...store.selection]
          if (action.tool === 'comment' && first !== undefined) {
            const doc = runtime.store.getDocument()
            const object = doc.objects.get(first)
            if (object !== undefined) {
              const bounds = runtime.registry.boundsOf(object, doc)
              store.startComment({
                x: bounds.x + bounds.width,
                y: bounds.y,
                objectId: object.id,
                on: { fx: 1, fy: 0 },
              })
            }
          }
          return
        }
        case 'cycle-shape':
          store.cycleShape()
          return
        case 'undo':
          commands.undo()
          return
        case 'redo':
          commands.redo()
          return
        case 'delete':
          commands.deleteSelection()
          return
        case 'duplicate':
          commands.duplicateSelection()
          return
        case 'group':
          commands.group()
          return
        case 'ungroup':
          commands.ungroup()
          return
        case 'copy':
          commands.copySelection()
          return
        case 'cut':
          commands.cutSelection()
          return
        case 'paste':
          commands.paste()
          return
        case 'reorder':
          commands.reorder(action.placement)
          return
        case 'toggle-lock': {
          if (store.selection.size === 0) return
          const anyLocked = [...store.selection].some(
            (id) => runtime.store.getObject(id)?.locked === true,
          )
          commands.setLocked(!anyLocked)
          store.announce(anyLocked ? 'Unlocked' : 'Locked')
          return
        }
        case 'resize-by': {
          /*
           * In SCREEN units, like a nudge, so a press grows the object by the
           * same visible amount at any zoom. The near corner stays put.
           */
          const scale = 1 / store.viewport.zoom
          const resizes = transformable('resizable').map((object) => ({
            id: object.id,
            frame: {
              ...object.frame,
              width: Math.max(MIN_SIDE, object.frame.width + action.dw * scale),
              height: Math.max(MIN_SIDE, object.frame.height + action.dh * scale),
            },
          }))
          commands.resizeObjects(resizes)
          const [only] = resizes
          if (resizes.length === 1 && only !== undefined) {
            store.announce(
              `Width ${String(Math.round(only.frame.width))}, height ${String(Math.round(only.frame.height))}`,
            )
          }
          return
        }
        case 'rotate-by': {
          const turn = (action.degrees * Math.PI) / 180
          const rotations = transformable('rotatable').map((object) => ({
            id: object.id,
            rotation: normalise(object.frame.rotation + turn),
          }))
          commands.rotateObjects(rotations)
          const [only] = rotations
          if (rotations.length === 1 && only !== undefined) {
            store.announce(
              `Rotated to ${String(Math.round((only.rotation * 180) / Math.PI))} degrees`,
            )
          }
          return
        }
        case 'select-all':
          commands.selectAll()
          return
        case 'deselect':
          /*
           * Escape closes what is OPEN before it clears what is selected, and
           * the search panel is one of those things.
           *
           * The panel has its own Escape handler, but it is on the input and
           * therefore only works once the input has focus — which arrives in
           * an effect, after the panel has painted. A key pressed in that
           * window reached this handler instead, which knew nothing about
           * search, and the panel stayed open. It showed up as a test failing
           * one run in three; it is the same gap for anybody who types fast.
           */
          if (store.searchOpen) {
            store.setSearchOpen(false)
            return
          }
          // An open menu is closed and nothing else: the selection it was
          // about is still what the next action is about.
          if (store.contextMenu !== null) {
            store.closeContextMenu()
            return
          }
          // Out of a crop, and the picture still selected: one step at a time.
          if (store.croppingId !== null) {
            store.setCropping(null)
            return
          }
          store.setEditing(null)
          store.clearSelection()
          store.closeContextMenu()
          return
        case 'edit-selection': {
          const [first] = [...store.selection]
          if (first !== undefined) store.setEditing(first)
          return
        }
        case 'nudge': {
          // Nudge in WORLD units scaled by zoom, so a keypress moves the same
          // apparent distance whatever the zoom level.
          const scale = 1 / store.viewport.zoom
          commands.moveObjects(
            [...store.selection].map((id) => ({
              id,
              dx: action.dx * scale,
              dy: action.dy * scale,
            })),
          )
          return
        }
        case 'zoom-in':
          store.setViewport(
            zoomAtCentre(store.viewport, width, height, nextZoomIn(store.viewport.zoom)),
          )
          return
        case 'zoom-out':
          store.setViewport(
            zoomAtCentre(store.viewport, width, height, nextZoomOut(store.viewport.zoom)),
          )
          return
        case 'zoom-reset':
          store.setViewport(zoomAtCentre(store.viewport, width, height, 1))
          return
        case 'search':
          store.setSearchOpen(true)
          return
        case 'zoom-fit': {
          const next = fitToDocument(runtime.store.getDocument(), runtime.registry, width, height)
          if (next !== null) store.setViewport(next)
          return
        }
        case 'zoom-selection': {
          const next = fitToObjects(
            runtime.store.getDocument(),
            runtime.registry,
            [...store.selection],
            width,
            height,
          )
          if (next !== null) store.setViewport(next)
          return
        }
      }
    }

    /**
     * The selected objects a keyboard transform applies to: unlocked, and
     * able to do it — the same test the handles use before they are drawn.
     */
    const transformable = (capability: 'resizable' | 'rotatable') => {
      const doc = runtime.store.getDocument()
      return [...useInteractionStore.getState().selection]
        .map((id) => doc.objects.get(id))
        .filter((object) => object !== undefined)
        .filter(
          (object) =>
            !object.locked && runtime.registry.get(object.type)?.capabilities[capability] === true,
        )
    }

    /**
     * Top-level objects in the order a page is read: by rows, then along each
     * row. Rows are bands of the grid step so that two notes a pixel apart in
     * height are one row rather than an arbitrary order.
     */
    const readingOrder = (): ObjectId[] => {
      const doc = runtime.store.getDocument()
      return [...doc.objects.values()]
        .filter((object) => object.parentId === null && !object.hidden)
        .filter((object) => runtime.registry.get(object.type)?.capabilities.spatial !== false)
        .map((object) => ({ id: object.id, at: runtime.registry.boundsOf(object, doc) }))
        .sort(
          (a, b) =>
            Math.round(a.at.y / ROW_BAND) - Math.round(b.at.y / ROW_BAND) || a.at.x - b.at.x,
        )
        .map((entry) => entry.id)
    }

    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') setSpaceHeld(false)
    }

    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onAnyKey, true)
    window.addEventListener('focusin', onFocusIn)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onAnyKey, true)
      window.removeEventListener('focusin', onFocusIn)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [commands, runtime.registry, runtime.store, setSpaceHeld])
}
