import type { ColorToken, StickyData } from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { InlineTextEditor } from './shared-editor.js'
import { SURFACE_VARS, fontFamily, textAlign } from '../scene/style-tokens.js'

function background(color: ColorToken | undefined): string {
  return SURFACE_VARS[color ?? 'yellow']
}

function StickyRenderer({ object }: ObjectViewProps<StickyData>) {
  return (
    <div
      className="of-sticky"
      style={{
        background: background(object.style.color),
        fontFamily: fontFamily(object.style.font),
        textAlign: textAlign(object.style.align),
        opacity: object.style.opacity ?? 1,
      }}
      // A real, focusable DOM node with an accessible name. Canvas-based
      // renderers cannot offer this at all, and retrofitting accessibility onto
      // a pixel buffer is far harder than keeping it from the start.
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
  return (
    <InlineTextEditor
      initialText={object.data.text}
      className="of-sticky of-sticky__editor"
      style={{
        background: background(object.style.color),
        fontFamily: fontFamily(object.style.font),
        textAlign: textAlign(object.style.align),
      }}
      ariaLabel="Edit sticky note text"
      onCommit={(text) => onCommit({ text })}
      onCancel={onCancel}
    />
  )
}

export const stickyView = defineObjectView<StickyData>({
  type: 'sticky',
  Renderer: StickyRenderer,
  InlineEditor: StickyEditor,
})
