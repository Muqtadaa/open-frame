import { isEmptyText, plainTextOf, type ColorValue, type EvidenceData } from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { RichTextEditor } from './RichTextEditor.js'
import { RichTextView } from './RichTextView.js'
import { fontFamily, textAlign, inkColor, readableInkOn, surfaceOf } from '../scene/style-tokens.js'

function background(color: ColorValue | undefined): string {
  return surfaceOf(color, 'gray')
}

/**
 * Everything the card says about where it came from, in reading order.
 *
 * Empty parts are dropped rather than rendered as blanks: a card with only a
 * quote must look like a plain slip, because structure is earned and a row of
 * empty labels is the form this product refuses to make anyone fill in.
 */
function provenance(data: EvidenceData): string {
  return [data.source, data.participant].filter((part) => part.trim() !== '').join(' · ')
}

function EvidenceRenderer({ object }: ObjectViewProps<EvidenceData>) {
  const { text, tags } = object.data
  const trail = provenance(object.data)

  return (
    <div
      className="of-slip of-evidence"
      style={{
        background: background(object.style.color),
        color: inkColor(object.style.textColor) ?? readableInkOn(object.style.color),
        opacity: object.style.opacity ?? 1,
      }}
      role="group"
      /*
       * The accessible name carries the provenance, not just the quote. A
       * screen reader user gets the same thing a sighted one does from the
       * footer — which is the point of the type existing at all.
       */
      aria-label={[
        isEmptyText(text) ? 'Empty evidence' : `Evidence: ${plainTextOf(text)}`,
        trail,
        tags.join(', '),
      ]
        .filter((part) => part !== '')
        .join('. ')}
    >
      <div
        className="of-slip__body"
        style={{
          fontFamily: fontFamily(object.style.font),
          textAlign: textAlign(object.style.align),
        }}
      >
        <RichTextView value={text} />
      </div>

      {(trail !== '' || tags.length > 0) && (
        <div className="of-slip__record" aria-hidden="true">
          {trail !== '' && <span className="of-slip__trail">{trail}</span>}
          {tags.length > 0 && (
            <span className="of-slip__tags">{tags.map((tag) => `#${tag}`).join(' ')}</span>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Editing on the card edits the QUOTE.
 *
 * The other three fields are in the record panel, and `text` deliberately is
 * not — one string with two editors is how an edit gets lost.
 */
function EvidenceEditor({ object, Chrome, onCommit, onCancel }: ObjectEditorProps<EvidenceData>) {
  return (
    <RichTextEditor
      initialText={object.data.text}
      Chrome={Chrome}
      className="of-slip of-evidence of-slip__editor"
      style={{
        background: background(object.style.color),
        color: inkColor(object.style.textColor) ?? readableInkOn(object.style.color),
        fontFamily: fontFamily(object.style.font),
        textAlign: textAlign(object.style.align),
      }}
      ariaLabel="Edit evidence text"
      onCommit={(text) => onCommit({ text })}
      onCancel={onCancel}
    />
  )
}

export const evidenceView = defineObjectView<EvidenceData>({
  type: 'evidence',
  Renderer: EvidenceRenderer,
  InlineEditor: EvidenceEditor,
})
