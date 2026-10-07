import { useEffect, useRef } from 'react'

/**
 * Escape closes the surface opened LAST, and only that one.
 *
 * Each open surface used to put its own capture-phase listener on the window,
 * and `stopPropagation` does not stop other listeners on the same target: with
 * the cluster review open and the Session sheet opened over it, one Escape
 * closed both (Codex, on #90). So there is one listener, and a stack of what
 * is open; a surface joins it as it opens and leaves as it closes.
 */
const open: { readonly close: { current: () => void } }[] = []

function onKey(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  const top = open[open.length - 1]
  if (top === undefined) return
  event.preventDefault()
  event.stopPropagation()
  top.close.current()
}

export function useEscapeToClose(close: () => void, active = true): void {
  const latest = useRef(close)
  // Kept current without moving the surface in the stack: re-registering on
  // every new callback would put it back on top.
  useEffect(() => {
    latest.current = close
  })
  useEffect(() => {
    if (!active) return
    const entry = { close: latest }
    open.push(entry)
    if (open.length === 1) window.addEventListener('keydown', onKey, true)
    return () => {
      const at = open.indexOf(entry)
      if (at !== -1) open.splice(at, 1)
      if (open.length === 0) window.removeEventListener('keydown', onKey, true)
    }
  }, [active])
}
