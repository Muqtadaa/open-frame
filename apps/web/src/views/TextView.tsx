import { isEmptyText, plainTextOf, type TextData } from '@openframe/core'

import { COLOR_VARS, fontFamily, textAlign } from '../scene/style-tokens.js'
import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { RichTextEditor } from './RichTextEditor.js'
import { RichTextView } from './RichTextView.js'

function TextRenderer({ object }: ObjectViewProps<TextData>) {
  const empty = isEmptyText(object.data.text)
  return (
    <div
      className={`of-text${empty ? ' of-text--empty' : ''}`}
      style={{
        color: COLOR_VARS[object.style.color ?? 'gray'],
        fontFamily: fontFamily(object.style.font),
        textAlign: textAlign(object.style.align),
        opacity: object.style.opacity ?? 1,
      }}
      role="group"
      aria-label={empty ? 'Empty text' : `Text: ${plainTextOf(object.data.text)}`}
    >
      {empty ? 'Text' : <RichTextView value={object.data.text} />}
    </div>
  )
}

function TextEditor({ object, zoom, onCommit, onCancel }: ObjectEditorProps<TextData>) {
  return (
    <RichTextEditor
      initialText={object.data.text}
      zoom={zoom}
      className="of-text of-text__editor"
      style={{
        color: COLOR_VARS[object.style.color ?? 'gray'],
        fontFamily: fontFamily(object.style.font),
        textAlign: textAlign(object.style.align),
      }}
      ariaLabel="Edit text"
      onCommit={(text) => onCommit({ text })}
      onCancel={onCancel}
    />
  )
}

export const textView = defineObjectView<TextData>({
  type: 'text',
  Renderer: TextRenderer,
  InlineEditor: TextEditor,
})
