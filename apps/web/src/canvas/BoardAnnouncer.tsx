import { useEffect, useRef, useState } from 'react'

import { useOpenFrame } from '../runtime/context.js'
import { useInteractionStore } from '../interaction/interaction-store.js'

/**
 * What the board says to a screen reader: what is selected, and what a key
 * just did to it.
 *
 * Selection changed in silence — the only live region on the page was the
 * save state — so somebody walking the board with Tab heard nothing about
 * where they had arrived, and a keyboard resize or lock happened without a
 * word (C3 #7).
 *
 * Polite, and CLEARED before it is set, so the same words said twice ("Width
 * 190, height 120" after two presses that each reached the minimum) are
 * spoken twice rather than read as no change.
 */
export function BoardAnnouncer() {
  const { runtime } = useOpenFrame()
  const selection = useInteractionStore((state) => state.selection)
  const announcement = useInteractionStore((state) => state.announcement)
  const [said, setSaid] = useState('')
  const first = useRef(true)

  useEffect(() => {
    // Not on arrival: an empty board opening says nothing.
    if (first.current) {
      first.current = false
      return
    }
    const doc = runtime.store.getDocument()
    const ids = [...selection]
    const [only] = ids
    const object = only === undefined ? undefined : doc.objects.get(only)
    const text =
      ids.length === 0
        ? 'Nothing selected'
        : ids.length === 1 && object !== undefined
          ? `Selected: ${runtime.registry.describeObject(object).summary}`
          : `${String(ids.length)} objects selected`
    return speak(text, setSaid)
  }, [selection, runtime])

  useEffect(() => {
    if (announcement === null) return
    return speak(announcement.text, setSaid)
  }, [announcement])

  return (
    <p className="of-visually-hidden" aria-live="polite" data-testid="board-announcer">
      {said}
    </p>
  )
}

function speak(text: string, set: (text: string) => void): () => void {
  set('')
  const timer = setTimeout(() => {
    set(text)
  }, 60)
  return () => {
    clearTimeout(timer)
  }
}
