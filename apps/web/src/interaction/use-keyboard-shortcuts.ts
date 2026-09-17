import { useEffect } from 'react'

import { useCommands } from '../hooks/use-commands.js'
import { useInteractionStore } from './interaction-store.js'

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

/**
 * Board-level keyboard shortcuts.
 *
 * Every one of these goes through the same command layer as the pointer — there
 * is no "keyboard path" that skips validation or history.
 */
export function useKeyboardShortcuts(setSpaceHeld: (held: boolean) => void): void {
  const commands = useCommands()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const store = useInteractionStore.getState()

      if (event.code === 'Space' && !isTextEntry(event.target)) {
        setSpaceHeld(true)
        if (!event.repeat) event.preventDefault()
        return
      }

      // Never steal keys from a text field the user is typing in.
      if (isTextEntry(event.target)) return

      const mod = event.metaKey || event.ctrlKey

      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) commands.redo()
        else commands.undo()
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        commands.deleteSelection()
        return
      }

      if (event.key === 'Escape') {
        store.setEditing(null)
        store.clearSelection()
        return
      }

      if (event.key === 'v' || event.key === 'V') store.setTool('select')
      if (event.key === 'n' || event.key === 'N') store.setTool('sticky')
      if (event.key === 'h' || event.key === 'H') store.setTool('pan')
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
  }, [commands, setSpaceHeld])
}
