import { isEmptyText, plainTextOf, type ColorValue, type StickyData } from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { RichTextEditor } from './RichTextEditor.js'
import { RichTextView } from './RichTextView.js'
import { fontFamily, textAlign, inkColor, surfaceOf } from '../scene/style-tokens.js'

function background(color: ColorValue | undefined): string {
  return surfaceOf(color, 'yellow')
}

function StickyRenderer({ object }: ObjectViewProps<StickyData>) {
  return (
    <div
      className="of-sticky"
      style={{
        background: background(object.style.color),
        color: inkColor(object.style.textColor),
        fontFamily: fontFamily(object.style.font),
        textAlign: textAlign(object.style.align),
        opacity: object.style.opacity ?? 1,
      }}
      // A real, focusable DOM node with an accessible name. Canvas-based
      // renderers cannot offer this at all, and retrofitting accessibility onto
      // a pixel buffer is far harder than keeping it from the start.
      role="group"
      aria-label={
        isEmptyText(object.data.text)
          ? 'Empty sticky note'
          : `Sticky note: ${plainTextOf(object.data.text)}`
      }
    >
      <div className="of-sticky__text">
        <RichTextView value={object.data.text} />
      </div>
    </div>
  )
}

function StickyEditor({ object, zoom, onCommit, onCancel }: ObjectEditorProps<StickyData>) {
  return (
    <RichTextEditor
      initialText={object.data.text}
      zoom={zoom}
      className="of-sticky of-sticky__editor"
      style={{
        background: background(object.style.color),
        color: inkColor(object.style.textColor),
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
