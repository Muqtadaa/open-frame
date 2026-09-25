import { type InsightData } from '@openframe/core'

import { StructuredEditor, StructuredSlip } from './StructuredSlip.js'
import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'

/**
 * A claim, and how sure of it somebody is.
 *
 * Drawn by `StructuredSlip`, like every other structured type — it used to
 * draw its own copy of that card, which is two sources of truth about what a
 * slip looks like.
 *
 * The claim is set LARGER than a note's body, which is the one thing this type
 * does differently and now lives in the stylesheet under `.of-insight` rather
 * than in a class this file had to remember to pass. An insight is the thing
 * a synthesis session is FOR, so it is allowed to be the loudest text on the
 * board without also being the one type that draws its own card.
 */
function InsightRenderer(props: ObjectViewProps<InsightData>) {
  const { text, confidence } = props.object.data
  return (
    <StructuredSlip
      {...props}
      text={text}
      noun="Insight"
      /*
       * Only once somebody has said it. "unstated" rendered as a word would
       * put a label on every card meaning nothing, and would read as an
       * assessment rather than the absence of one.
       */
      record={[confidence === 'unstated' ? '' : `confidence: ${confidence}`]}
      defaultColor="blue"
      className="of-insight"
    />
  )
}

function InsightEditor(props: ObjectEditorProps<InsightData>) {
  return (
    <StructuredEditor
      {...props}
      text={props.object.data.text}
      label="Edit insight text"
      defaultColor="blue"
      className="of-insight"
    />
  )
}

export const insightView = defineObjectView<InsightData>({
  type: 'insight',
  defaultColor: 'blue',
  Renderer: InsightRenderer,
  InlineEditor: InsightEditor,
})
