import type { ColorToken, InsightData } from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { InlineTextEditor } from './shared-editor.js'
import { SURFACE_VARS, fontFamily, textAlign } from '../scene/style-tokens.js'

function background(color: ColorToken | undefined): string {
  return SURFACE_VARS[color ?? 'blue']
}

function InsightRenderer({ object }: ObjectViewProps<InsightData>) {
  const { text, confidence } = object.data

  return (
    <div
      className="of-slip of-insight"
      style={{
        background: background(object.style.color),
        opacity: object.style.opacity ?? 1,
      }}
      role="group"
      aria-label={
        [
          text === '' ? 'Empty insight' : `Insight: ${text}`,
          confidence === 'unstated' ? '' : `${confidence} confidence`,
        ]
          .filter((part) => part !== '')
          .join('. ')
      }
    >
      <div
        className="of-slip__body of-insight__claim"
        style={{
          fontFamily: fontFamily(object.style.font),
          textAlign: textAlign(object.style.align),
        }}
      >
        {text}
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

function InsightEditor({ object, onCommit, onCancel }: ObjectEditorProps<InsightData>) {
  return (
    <InlineTextEditor
      initialText={object.data.text}
      className="of-slip of-insight of-insight__claim of-slip__editor"
      style={{
        background: background(object.style.color),
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
