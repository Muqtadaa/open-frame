import type { TextData } from '@openframe/core'

import { COLOR_VARS, fontFamily, textAlign } from './style-tokens.js'
import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { InlineTextEditor } from './shared-editor.js'

function TextRenderer({ object }: ObjectViewProps<TextData>) {
  const empty = object.data.text.trim() === ''
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
      aria-label={empty ? 'Empty text' : `Text: ${object.data.text}`}
    >
      {empty ? 'Text' : object.data.text}
    </div>
  )
}

function TextEditor({ object, onCommit, onCancel }: ObjectEditorProps<TextData>) {
  return (
    <InlineTextEditor
      initialText={object.data.text}
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
