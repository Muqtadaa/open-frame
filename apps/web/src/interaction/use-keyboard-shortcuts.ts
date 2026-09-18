import { useEffect } from 'react'

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

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
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
    const onKeyDown = (event: KeyboardEvent): void => {
      const store = useInteractionStore.getState()

      // Space-drag panning is a hold, not a shortcut, so it sits outside the keymap.
      if (event.code === 'Space' && !isTextEntry(event.target)) {
        setSpaceHeld(true)
        if (!event.repeat) event.preventDefault()
        return
      }

      // Never steal keys from a field the user is typing in — except Escape,
      // which must always be able to end editing.
      if (isTextEntry(event.target) && event.key !== 'Escape') return

      const action = resolveKeyAction(event)
      if (action === null) return
      event.preventDefault()

      const { width, height } = store.canvasSize

      switch (action.kind) {
        case 'tool':
          store.setTool(action.tool)
          return
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
          const anyLocked = [...store.selection].some(
            (id) => runtime.store.getObject(id)?.locked === true,
          )
          commands.setLocked(!anyLocked)
          return
        }
        case 'select-all':
          commands.selectAll()
          return
        case 'deselect':
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

    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') setSpaceHeld(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [commands, runtime.registry, runtime.store, setSpaceHeld])
}
