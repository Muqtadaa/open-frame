import { isEmptyText, plainTextOf, type ColorValue, type TextData } from '@openframe/core'

import { fontFamily, textAlign, verticalAlign, inkOf } from '../scene/style-tokens.js'
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
function ink(style: { readonly textColor?: ColorValue; readonly color?: ColorValue }): string {
  return inkOf(style.textColor ?? style.color)
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
        justifyContent: verticalAlign(object.style.verticalAlign),
        opacity: object.style.opacity ?? 1,
      }}
      role="group"
      aria-label={empty ? 'Empty text' : `Text: ${plainTextOf(object.data.text)}`}
    >
      {/*
        * The text is its own element rather than a bare child. The clamp that
        * marks hidden text has to live on a descendant of the sized box, since
        * `100cqh` is measured against the nearest container ANCESTOR — an
        * element cannot query itself.
        */}
      <div className="of-text__body" data-fit-text>
        {empty ? 'Text' : <RichTextView value={object.data.text} />}
      </div>
    </div>
  )
}

function TextEditor({ object, Chrome, onCommit }: ObjectEditorProps<TextData>) {
  return (
    <RichTextEditor
      initialText={object.data.text}
      Chrome={Chrome}
      className="of-text of-text__editor"
      style={{
        color: ink(object.style),
        fontFamily: fontFamily(object.style.font),
        textAlign: textAlign(object.style.align),
        justifyContent: verticalAlign(object.style.verticalAlign),
      }}
      ariaLabel="Edit text"
      onCommit={(text) => onCommit({ text })}
    />
  )
}

export const textView = defineObjectView<TextData>({
  type: 'text',
  Renderer: TextRenderer,
  InlineEditor: TextEditor,
})
