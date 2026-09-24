import { type EvidenceData } from '@openframe/core'

import { StructuredEditor, StructuredSlip } from './StructuredSlip.js'
import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'

/**
 * Everything the card says about where it came from, in reading order.
 *
 * Empty parts are dropped by the slip rather than rendered as blanks: a card
 * with only a quote must look like a plain slip, because structure is earned
 * and a row of empty labels is the form this product refuses to make anyone
 * fill in.
 */
function provenance(data: EvidenceData): string {
  return [data.source, data.participant].filter((part) => part.trim() !== '').join(' · ')
}

/**
 * A quote, and where it came from.
 *
 * Drawn by `StructuredSlip` like every other structured type. It used to draw
 * its own copy of that card — the same stock, the same body, the same record
 * line under the same hairline, written out again — which is two sources of
 * truth about what a slip looks like. They had already drifted: this one and
 * the insight card were the two that never moved onto the shared component,
 * so a change to the slip reached six types and missed two.
 *
 * The tags keep their `#`, which is what separates them from the provenance
 * above. They used to be a shade fainter as well; the record line is already
 * subordinate to the quote, and a second level of subordination inside it does
 * not survive being glanced at on a small card.
 */
function EvidenceRenderer(props: ObjectViewProps<EvidenceData>) {
  const { text, tags } = props.object.data
  return (
    <StructuredSlip
      {...props}
      text={text}
      noun="Evidence"
      record={[provenance(props.object.data), tags.map((tag) => `#${tag}`).join(' ')]}
      defaultColor="gray"
      className="of-evidence"
    />
  )
}

/**
 * Editing on the card edits the QUOTE.
 *
 * The other three fields are in the record panel, and `text` deliberately is
 * not — one string with two editors is how an edit gets lost.
 */
function EvidenceEditor(props: ObjectEditorProps<EvidenceData>) {
  return (
    <StructuredEditor
      {...props}
      text={props.object.data.text}
      label="Edit evidence text"
      defaultColor="gray"
      className="of-evidence"
    />
  )
}

export const evidenceView = defineObjectView<EvidenceData>({
  type: 'evidence',
  Renderer: EvidenceRenderer,
  InlineEditor: EvidenceEditor,
})
