import type { StickyData } from '@openframe/core'
import { useEffect, useRef, useState } from 'react'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'

const DEFAULT_COLOR = 'var(--of-sticky-yellow)'

const COLOR_VARS: Record<string, string> = {
  yellow: 'var(--of-sticky-yellow)',
  green: 'var(--of-sticky-green)',
  blue: 'var(--of-sticky-blue)',
  red: 'var(--of-sticky-red)',
  violet: 'var(--of-sticky-violet)',
  orange: 'var(--of-sticky-orange)',
  gray: 'var(--of-sticky-gray)',
}

function StickyRenderer({ object }: ObjectViewProps<StickyData>) {
  const background = COLOR_VARS[object.style.color ?? 'yellow'] ?? DEFAULT_COLOR
  return (
    <div
      className="of-sticky"
      style={{ background, opacity: object.style.opacity ?? 1 }}
      // A real, focusable DOM node with an accessible name. Canvas-based
      // renderers cannot offer this at all, and retrofitting accessibility
      // onto a pixel buffer is far harder than keeping it from the start.
      role="group"
      aria-label={
        object.data.text === '' ? 'Empty sticky note' : `Sticky note: ${object.data.text}`
      }
    >
      <div className="of-sticky__text">{object.data.text}</div>
    </div>
  )
}

function StickyEditor({ object, onCommit, onCancel }: ObjectEditorProps<StickyData>) {
  const [draft, setDraft] = useState(object.data.text)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const background = COLOR_VARS[object.style.color ?? 'yellow'] ?? DEFAULT_COLOR

  return (
    <textarea
      ref={ref}
      className="of-sticky of-sticky__editor"
      style={{ background }}
      value={draft}
      aria-label="Edit sticky note text"
      onChange={(event) => setDraft(event.target.value)}
      /*
       * ONE command when editing ends — not one per keystroke. The draft is
       * interaction state; only the committed result becomes board history.
       * Undo inside the field is the browser's job, not the board's.
       */
      onBlur={() => onCommit({ text: draft })}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          onCommit({ text: draft })
        }
        event.stopPropagation()
      }}
    />
  )
}

export const stickyView = defineObjectView<StickyData>({
  type: 'sticky',
  Renderer: StickyRenderer,
  InlineEditor: StickyEditor,
})
