import { isEmptyText, plainTextOf, type ColorToken, type TextData } from '@openframe/core'

import { COLOR_VARS, fontFamily, textAlign } from '../scene/style-tokens.js'
import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { RichTextEditor } from './RichTextEditor.js'
import { RichTextView } from './RichTextView.js'

/**
 * A text object's ink.
 *
 * `textColor` is what the inspector writes now. `color` is what it wrote
 * before `textColor` existed, when a text object was the one type whose
 * `color` meant ink rather than surface — so boards written then are read
 * through, and keep the colour they were given, without a migration that
 * would have to decide the same question for every other type.
 */
function ink(style: { readonly textColor?: ColorToken; readonly color?: ColorToken }): string {
  return COLOR_VARS[style.textColor ?? style.color ?? 'gray']
}

function TextRenderer({ object }: ObjectViewProps<TextData>) {
  const empty = isEmptyText(object.data.text)
  return (
    <div
      className={`of-text${empty ? ' of-text--empty' : ''}`}
      style={{
        color: ink(object.style),
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
        color: ink(object.style),
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
