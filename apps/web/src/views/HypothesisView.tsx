import type { HypothesisData } from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { StructuredEditor, StructuredSlip, statusLine } from './StructuredSlip.js'

function HypothesisRenderer(props: ObjectViewProps<HypothesisData>) {
  const { object } = props
  return (
    <StructuredSlip
      {...props}
      text={object.data.text}
      noun="Hypothesis"
      record={[statusLine(object.data.status, 'untested')]}
      defaultColor="violet"
      className="of-hypothesis"
    />
  )
}

function HypothesisEditor(props: ObjectEditorProps<HypothesisData>) {
  return (
    <StructuredEditor
      {...props}
      text={props.object.data.text}
      label="Edit hypothesis"
      defaultColor="violet"
      className="of-hypothesis"
    />
  )
}

export const hypothesisView = defineObjectView<HypothesisData>({
  type: 'hypothesis',
  Renderer: HypothesisRenderer,
  InlineEditor: HypothesisEditor,
})
