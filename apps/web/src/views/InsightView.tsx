import { isEmptyText, plainTextOf, type ColorValue, type InsightData } from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { RichTextEditor } from './RichTextEditor.js'
import { RichTextView } from './RichTextView.js'
import { fontFamily, textAlign, inkColor, readableInkOn, surfaceOf } from '../scene/style-tokens.js'

function background(color: ColorValue | undefined): string {
  return surfaceOf(color, 'blue')
}

function InsightRenderer({ object }: ObjectViewProps<InsightData>) {
  const { text, confidence } = object.data

  return (
    <div
      className="of-slip of-insight"
      style={{
        background: background(object.style.color),
        color: inkColor(object.style.textColor) ?? readableInkOn(object.style.color),
        opacity: object.style.opacity ?? 1,
      }}
      role="group"
      aria-label={[
        isEmptyText(text) ? 'Empty insight' : `Insight: ${plainTextOf(text)}`,
        confidence === 'unstated' ? '' : `${confidence} confidence`,
      ]
        .filter((part) => part !== '')
        .join('. ')}
    >
      <div
        className="of-slip__body of-insight__claim"
        style={{
          fontFamily: fontFamily(object.style.font),
          textAlign: textAlign(object.style.align),
        }}
      >
        <RichTextView value={text} />
      </div>

      {/*
       * Only shown once someone has said it. An unstated confidence rendered
       * as "unstated" would put a word on every card that means nothing, and
       * would read as an assessment rather than the absence of one.
       */}
      {confidence !== 'unstated' && (
        <div className="of-slip__record" aria-hidden="true">
          <span className="of-slip__trail">confidence: {confidence}</span>
        </div>
      )}
    </div>
  )
}

function InsightEditor({ object, zoom, onCommit, onCancel }: ObjectEditorProps<InsightData>) {
  return (
    <RichTextEditor
      initialText={object.data.text}
      zoom={zoom}
      className="of-slip of-insight of-insight__claim of-slip__editor"
      style={{
        background: background(object.style.color),
        color: inkColor(object.style.textColor) ?? readableInkOn(object.style.color),
        fontFamily: fontFamily(object.style.font),
        textAlign: textAlign(object.style.align),
      }}
      ariaLabel="Edit insight text"
      onCommit={(text) => onCommit({ text })}
      onCancel={onCancel}
    />
  )
}

export const insightView = defineObjectView<InsightData>({
  type: 'insight',
  Renderer: InsightRenderer,
  InlineEditor: InsightEditor,
})
