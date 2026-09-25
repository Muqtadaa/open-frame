import type { DecisionData } from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { StructuredEditor, StructuredSlip, statusLine, firstLine } from './StructuredSlip.js'

function DecisionRenderer(props: ObjectViewProps<DecisionData>) {
  const { object } = props
  return (
    <StructuredSlip
      {...props}
      text={object.data.text}
      noun="Decision"
      record={[statusLine(object.data.status, 'proposed'), firstLine(object.data.rationale)]}
      defaultColor="green"
      className="of-decision"
    />
  )
}

function DecisionEditor(props: ObjectEditorProps<DecisionData>) {
  return (
    <StructuredEditor
      {...props}
      text={props.object.data.text}
      label="Edit decision"
      defaultColor="green"
      className="of-decision"
    />
  )
}

export const decisionView = defineObjectView<DecisionData>({
  type: 'decision',
  defaultColor: 'green',
  Renderer: DecisionRenderer,
  InlineEditor: DecisionEditor,
})
